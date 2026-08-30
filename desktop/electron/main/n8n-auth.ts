// 本地 n8n 自动登录注入
//
// 背景：Electron 新内核（Chromium 138+）默认阻止第三方 Cookie。
// 深瞳AI 是 file:// 应用，内嵌 http://127.0.0.1:5678 的 n8n iframe 属于“第三方上下文”，
// 登录成功后 Set-Cookie 会被浏览器直接丢弃，导致工作流页“密码正确、登录转圈、永远停在登录页”。
//
// 方案：桌面端启动时自动接管本地 n8n 管理员账号（保留全部工作流），
// 自动登录获取会话 Cookie，并通过 webRequest 给 n8n 的所有请求强制附加 Cookie 头，
// 彻底绕开浏览器的第三方 Cookie 限制。用户打开工作流时即为已登录状态，无需手动登录。
//
// 2026-08-30 修复：n8n 的 /rest 路由在 HTTP 端口就绪（"ready on port"）之后才注册，
// 自动登录若在端口就绪后立即发起登录，会命中 404 窗口导致"自动登录失败"。
// 现在等待 /rest/login 路由注册完成（非 404）后再登录，并对瞬时失败做重试；
// 同时兼容"全新 n8n 实例（尚无 owner 账号）"与"已有实例密码错乱"两种情况。

import { app, session } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { request as httpRequest, get as httpGet } from 'node:http'
import { getRuntimeRoot } from './runtime-config'
import { getCredential, setCredential } from './services/credential-store'

const N8N_ORIGIN = 'http://127.0.0.1:5678'
/** n8n 完全就绪等待上限（含 /rest 路由注册） */
const N8N_WAIT_TIMEOUT_MS = 45000
/** 登录瞬时失败（404/5xx/429/网络）重试次数 */
const LOGIN_RETRY_MAX = 10
const LOGIN_RETRY_INTERVAL_MS = 1000

let currentCookie: string | null = null
let hookInstalled = false
let authInFlight: Promise<void> | null = null

/** 当前 n8n 会话 Cookie（供主进程调用编辑器 REST API：导入工作流、查询执行等） */
export function getN8nAuthCookie(): string | null {
  return currentCookie
}

function credentialsFile(): string {
  return join(app.getPath('userData'), 'n8n-credentials.json')
}

function readCredentials(): { email: string; password: string } | null {
  try {
    const file = credentialsFile()
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed && typeof parsed.email !== 'string') return null
    // 密码优先从安全凭据存储读取（safeStorage 加密）
    let password = getCredential('n8n.password')
    // 兼容旧版本：明文密码曾直接写在 n8n-credentials.json 中，读到后迁移到安全存储
    const legacyPassword = typeof parsed.password === 'string' ? parsed.password : ''
    if (!password && legacyPassword) {
      password = legacyPassword
      setCredential('n8n.password', legacyPassword)
      const { password: _omit, ...rest } = parsed
      writeFileSync(file, JSON.stringify(rest, null, 2), 'utf8')
    }
    if (!password) return null
    return { email: parsed.email, password }
  } catch {
    return null
  }
}

function saveCredentials(email: string, password: string): void {
  try {
    // 密码存入安全凭据存储（safeStorage 加密），文件仅保留非敏感的邮箱
    setCredential('n8n.password', password)
    writeFileSync(credentialsFile(), JSON.stringify({ email }, null, 2), 'utf8')
  } catch (err) {
    console.error('[n8n-auth] 保存本地凭据失败:', err)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 等待本地 n8n 服务完全就绪（最多 45 秒）：
 * 1. /healthz 返回 200（HTTP 端口已监听）；
 * 2. /rest/login 路由已注册（非 404）——n8n 的路由在端口就绪后才注册，
 *    若只等 /healthz 就发起登录，会命中 404 窗口导致自动登录失败。
 */
function waitForN8n(): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + N8N_WAIT_TIMEOUT_MS
    const check = () => {
      if (Date.now() > deadline) {
        resolve(false)
        return
      }
      const req = httpGet(N8N_ORIGIN + '/healthz', (res) => {
        res.resume()
        if (res.statusCode !== 200) {
          setTimeout(check, 1000)
          return
        }
        // 端口就绪后继续等 REST 路由注册
        const probe = httpGet(N8N_ORIGIN + '/rest/login', (res2) => {
          res2.resume()
          if (res2.statusCode !== 404) {
            resolve(true)
          } else {
            setTimeout(check, 1000)
          }
        })
        probe.on('error', () => setTimeout(check, 1000))
        probe.setTimeout(2000, () => {
          probe.destroy()
          setTimeout(check, 1000)
        })
      })
      req.on('error', () => setTimeout(check, 1000))
      req.setTimeout(2000, () => {
        req.destroy()
        setTimeout(check, 1000)
      })
    }
    check()
  })
}

/** 登录 n8n，返回会话 Cookie 值（n8n-auth=...）与 HTTP 状态码；失败 cookie 为 null */
function loginProbe(email: string, password: string): Promise<{ cookie: string | null; status: number | null }> {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify({ email, password })
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port: 5678,
          path: '/rest/login',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = ''
          res.on('data', (d: Buffer) => { data += d.toString() })
          res.on('end', () => {
            if (res.statusCode === 200) {
              const setCookie = res.headers['set-cookie']
              const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
              const match = raw ? raw.match(/n8n-auth=([^;]+)/) : null
              resolve({ cookie: match ? match[1] : null, status: res.statusCode ?? null })
            } else {
              resolve({ cookie: null, status: res.statusCode ?? null })
            }
          })
        },
      )
      req.on('error', () => resolve({ cookie: null, status: null }))
      req.write(body)
      req.end()
    } catch {
      resolve({ cookie: null, status: null })
    }
  })
}
/** 带重试的登录：n8n 启动早期可能出现 404（路由未注册）/5xx（内部未就绪）/网络抖动，
 *  这类瞬时失败自动重试；401 等确定性失败立即返回失败 */
async function loginWithRetry(email: string, password: string): Promise<string | null> {
  for (let attempt = 1; attempt <= LOGIN_RETRY_MAX; attempt += 1) {
    const result = await loginProbe(email, password)
    if (result.cookie) return result.cookie
    if (result.status === null || result.status === 404 || result.status === 429 || result.status >= 500) {
      await delay(LOGIN_RETRY_INTERVAL_MS)
      continue
    }
    return null
  }
  return null
}

/**
 * 全新 n8n 实例（数据库中尚无 owner 账号，首次运行）时，走 n8n 官方 /rest/setup
 * 创建 owner 并返回会话 Cookie；若实例已 setup（返回 400）则返回 null，
 * 由调用方回退到"直改数据库密码"方案。
 */
function setupOwnerIfNeeded(email: string, password: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const body = JSON.stringify({ email, firstName: 'admin', lastName: 'n8n', password })
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port: 5678,
          path: '/rest/setup',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = ''
          res.on('data', (d: Buffer) => { data += d.toString() })
          res.on('end', () => {
            if (res.statusCode === 200) {
              const setCookie = res.headers['set-cookie']
              const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie
              const match = raw ? raw.match(/n8n-auth=([^;]+)/) : null
              resolve(match ? match[1] : null)
            } else {
              resolve(null)
            }
          })
        },
      )
      req.on('error', () => resolve(null))
      req.write(body)
      req.end()
    } catch {
      resolve(null)
    }
  })
}

/**
 * 用 n8n 自带 node 重置 owner 密码（runtime 的 sqlite3/bcryptjs 与 runtime node ABI 匹配，
 * 不能用 Electron 主进程直接 require）。只更新 password 字段，邮箱与全部工作流数据不动。
 * 若数据库中不存在 owner 账号，退出码为 2（ERR_NO_OWNER），由调用方决定走 setup。
 */
function resetOwnerPassword(password: string): Promise<{ email: string }> {
  return new Promise((resolve, reject) => {
    try {
      const runtimeRoot = getRuntimeRoot()
      const nodeExe = join(runtimeRoot, 'n8n', 'node', 'node.exe')
      const dbPath = join(app.getPath('userData'), 'n8n-data', '.n8n', 'database.sqlite')
      const scriptFile = join(app.getPath('userData'), 'n8n-data', '.tmp-n8n-set-password.js')
      const script = [
        `const s=require(process.argv[2]);`,
        `const b=require(process.argv[3]);`,
        `const db=new s.Database(process.argv[4]);`,
        `db.configure('busyTimeout',10000);`,
        `db.run('UPDATE user SET password=? WHERE role=''global:owner''',[b.hashSync(process.argv[5],10)],function(e){`,
        `  if(e){console.error('ERR '+e.message);process.exit(1)}`,
        `  if(this.changes===0){console.error('ERR_NO_OWNER');process.exit(2)}`,
        `  db.get('SELECT email FROM user WHERE role=''global:owner''',function(e2,r){`,
        `    if(e2){console.error('ERR2 '+e2.message);process.exit(1)}`,
        `    console.log('OK '+JSON.stringify({email:r&&r.email}));db.close();process.exit(0)`,
        `  })`,
        `});`,
      ].join('\n')
      writeFileSync(scriptFile, script, 'utf8')
      const child = spawn(
        nodeExe,
        [
          scriptFile,
          join(runtimeRoot, 'n8n', 'node_modules', 'sqlite3'),
          join(runtimeRoot, 'n8n', 'node_modules', 'bcryptjs'),
          dbPath,
          password,
        ],
        { windowsHide: true },
      )
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
      child.on('error', (err) => reject(err))
      child.on('close', (code) => {
        if (code === 0) {
          const match = stdout.match(/OK (\{.*\})/)
          if (match) {
            try {
              resolve(JSON.parse(match[1]))
            } catch {
              reject(new Error('解析重置结果失败: ' + stdout))
            }
          } else {
            reject(new Error('重置输出异常: ' + stdout + stderr))
          }
        } else if (code === 2) {
          reject(new Error('ERR_NO_OWNER: n8n 数据库中没有 owner 账号（全新实例）'))
        } else {
          reject(new Error('重置密码退出码 ' + code + ': ' + stderr))
        }
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}
/** 给 n8n 的所有请求强制附加会话 Cookie（绕开第三方 Cookie 限制） */
function installCookieHook(): void {
  if (hookInstalled) return
  hookInstalled = true
  try {
    const filter = { urls: ['http://127.0.0.1:5678/*'] }
    session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      try {
        if (currentCookie) {
          details.requestHeaders['Cookie'] = 'n8n-auth=' + currentCookie
        }
      } catch {
        // 单个请求异常忽略
      }
      callback({ requestHeaders: details.requestHeaders })
    })
  } catch (err) {
    console.error('[n8n-auth] 安装 Cookie 注入失败:', err)
  }
}

/**
 * 确保本地 n8n 处于自动登录状态（幂等）：
 * 1. 等待 n8n 完全就绪（含 /rest 路由注册），避免启动竞态导致登录 404；
 * 2. 有本地凭据则直接登录（带瞬时失败重试）；
 * 3. 没有或失效则先试官方 setup（全新实例），再直改数据库 owner 密码（已有实例）；
 * 4. 登录成功后给 n8n 请求注入 Cookie 头。
 */
export function ensureN8nAuth(): Promise<void> {
  if (authInFlight) return authInFlight
  authInFlight = (async () => {
    try {
      const ready = await waitForN8n()
      if (!ready) {
        console.warn('[n8n-auth] 等待 n8n 就绪超时，跳过自动登录')
        return
      }
      const stored = readCredentials()
      let email = stored ? stored.email : ''
      let cookie: string | null = null
      if (stored) {
        cookie = await loginWithRetry(stored.email, stored.password)
      }
      if (!cookie) {
        // 同时满足 n8n 密码策略（8-64 位、含数字、含大写）
        const password = 'n8n-' + randomBytes(16).toString('hex') + 'A1'
        const targetEmail = email || 'admin@local.n8n'
        // 全新实例：官方 setup 接口创建 owner 并直接返回会话
        cookie = await setupOwnerIfNeeded(targetEmail, password)
        // 已有实例：直改数据库 owner 密码（保留邮箱与工作流）
        if (!cookie) {
          try {
            const owner = await resetOwnerPassword(password)
            email = owner.email || targetEmail
            cookie = await loginWithRetry(email, password)
          } catch (err) {
            console.error('[n8n-auth] 重置 owner 密码失败:', err)
          }
        }
        if (cookie) {
          saveCredentials(email, password)
        }
      }
      if (cookie) {
        currentCookie = cookie
        installCookieHook()
        console.log('[n8n-auth] 本地 n8n 已自动登录，工作流登录态注入完成')
      } else {
        console.warn('[n8n-auth] 自动登录失败（登录接口未返回 Cookie）')
      }
    } catch (err) {
      console.error('[n8n-auth] 自动登录异常:', err)
    } finally {
      authInFlight = null
    }
  })()
  return authInFlight
}


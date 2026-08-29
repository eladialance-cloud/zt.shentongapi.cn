// 本地 n8n 自动登录注入
//
// 背景：Electron 新内核（Chromium 138+）默认阻止第三方 Cookie。
// 深瞳AI 是 file:// 应用，内嵌 http://127.0.0.1:5678 的 n8n iframe 属于“第三方上下文”，
// 登录成功后 Set-Cookie 会被浏览器直接丢弃，导致工作流页“密码正确、登录转圈、永远停在登录页”。
//
// 方案：桌面端启动时自动接管本地 n8n 管理员账号（保留全部工作流），
// 自动登录获取会话 Cookie，并通过 webRequest 给 n8n 的所有请求强制附加 Cookie 头，
// 彻底绕开浏览器的第三方 Cookie 限制。用户打开工作流时即为已登录状态，无需手动登录。

import { app, session } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { request as httpRequest, get as httpGet } from 'node:http'
import { getRuntimeRoot } from './runtime-config'

const N8N_ORIGIN = 'http://127.0.0.1:5678'

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
    if (parsed && typeof parsed.email === 'string' && typeof parsed.password === 'string') {
      return { email: parsed.email, password: parsed.password }
    }
    return null
  } catch {
    return null
  }
}

function saveCredentials(email: string, password: string): void {
  try {
    writeFileSync(credentialsFile(), JSON.stringify({ email, password }, null, 2), 'utf8')
  } catch (err) {
    console.error('[n8n-auth] 保存本地凭据失败:', err)
  }
}

/**
 * 用 n8n 自带 node 重置 owner 密码（runtime 的 sqlite3/bcryptjs 与 runtime node ABI 匹配，
 * 不能用 Electron 主进程直接 require）。只更新 password 字段，邮箱与全部工作流数据不动。
 */
function resetOwnerPassword(password: string): Promise<{ email: string }> {
  return new Promise((resolve, reject) => {
    try {
      const runtimeRoot = getRuntimeRoot()
      const nodeExe = join(runtimeRoot, 'n8n', 'node', 'node.exe')
      const dbPath = join(app.getPath('userData'), 'n8n-data', '.n8n', 'database.sqlite')
      const scriptFile = join(app.getPath('userData'), 'n8n-data', '.tmp-n8n-set-password.js')
      const script = [
        "const s=require(process.argv[2]);",
        "const b=require(process.argv[3]);",
        "const db=new s.Database(process.argv[4]);",
        "db.configure('busyTimeout',10000);",
        "db.run(\"UPDATE user SET password=? WHERE role='global:owner'\",[b.hashSync(process.argv[5],10)],function(e){",
        "  if(e){console.error('ERR '+e.message);process.exit(1)}",
        "  db.get(\"SELECT email FROM user WHERE role='global:owner'\",function(e2,r){",
        "    if(e2){console.error('ERR2 '+e2.message);process.exit(1)}",
        "    console.log('OK '+JSON.stringify({email:r&&r.email}));db.close();process.exit(0)",
        "  })",
        "});",
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
        } else {
          reject(new Error('重置密码退出码 ' + code + ': ' + stderr))
        }
      })
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/** 等待本地 n8n 服务就绪（最多 30 秒） */
function waitForN8n(): Promise<boolean> {
  return new Promise((resolve) => {
    const deadline = Date.now() + 30000
    const check = () => {
      if (Date.now() > deadline) {
        resolve(false)
        return
      }
      const req = httpGet(N8N_ORIGIN + '/healthz', (res) => {
        if (res.statusCode === 200) {
          res.resume()
          resolve(true)
        } else {
          res.resume()
          setTimeout(check, 1000)
        }
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

/** 登录 n8n，返回会话 Cookie 值（n8n-auth=...），失败返回 null */
function login(email: string, password: string): Promise<string | null> {
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
 * 1. 有本地凭据则直接登录；
 * 2. 没有或失效则重置 owner 密码（保留邮箱/工作流）并保存凭据；
 * 3. 登录成功后给 n8n 请求注入 Cookie 头。
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
      let creds = readCredentials()
      let cookie: string | null = null
      if (creds) {
        cookie = await login(creds.email, creds.password)
      }
      if (!cookie) {
        const password = 'n8n-' + randomBytes(16).toString('hex')
        const { email } = await resetOwnerPassword(password)
        creds = { email: email || 'admin@local.n8n', password }
        saveCredentials(creds.email, creds.password)
        cookie = await login(creds.email, creds.password)
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

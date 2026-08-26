/**
 * 发布平台扫码登录（桌面端）
 * 账号绑定在桌面端完成：弹出登录窗口（persist 分区会话）→ 采集 cookies → safeStorage 加密 → 存本地。
 * 后续发布窗口复用同一 partition 会话；管理后台只控制平台开关。
 */

import { app, BrowserWindow, net, safeStorage, session, shell } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getMainWindow } from './windows/main-window'
import type { PlatformInfo, PlatformSetupLoginResult, PlatformTestLoginResult } from '../shared/types'

/** 平台预设（id 与后端 publish_platforms.platform 一致） */
interface PlatformPreset {
  id: string
  displayName: string
  loginUrl: string
  publishUrl: string
  homeUrl: string
}

const PLATFORMS: PlatformPreset[] = [
  {
    id: 'douyin',
    displayName: '抖音',
    loginUrl: 'https://creator.douyin.com/',
    publishUrl: 'https://creator.douyin.com/creator-micro/content/upload',
    homeUrl: 'https://creator.douyin.com/',
  },
  {
    id: 'kuaishou',
    displayName: '快手',
    loginUrl: 'https://cp.kuaishou.com/',
    publishUrl: 'https://cp.kuaishou.com/article/publish/video',
    homeUrl: 'https://cp.kuaishou.com/',
  },
  {
    id: 'xiaohongshu',
    displayName: '小红书',
    loginUrl: 'https://creator.xiaohongshu.com/',
    publishUrl: 'https://creator.xiaohongshu.com/publish/publish?source=official',
    homeUrl: 'https://creator.xiaohongshu.com/',
  },
  {
    id: 'bilibili',
    displayName: 'B站',
    loginUrl: 'https://member.bilibili.com/',
    publishUrl: 'https://member.bilibili.com/platform/upload/video/frame',
    homeUrl: 'https://member.bilibili.com/',
  },
  {
    id: 'xigua',
    displayName: '西瓜视频',
    loginUrl: 'https://creator.xigua.com/',
    publishUrl: 'https://creator.xigua.com/creator/content/publish',
    homeUrl: 'https://creator.xigua.com/',
  },
  {
    id: 'wx_channels',
    displayName: '蝴蝶号',
    loginUrl: 'https://channels.weixin.qq.com/',
    publishUrl: 'https://channels.weixin.qq.com/platform/post/create',
    homeUrl: 'https://channels.weixin.qq.com/',
  },
]

interface CookieLike {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  expirationDate?: number
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
}

interface SessionEntry {
  enc: string
  displayName?: string
}

/** 本地会话文件：userData/platform-sessions.json，键为平台 id */
function sessionFilePath(): string {
  return join(app.getPath('userData'), 'platform-sessions.json')
}

function readSessionMap(): Record<string, SessionEntry> {
  try {
    const raw = readFileSync(sessionFilePath(), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, SessionEntry>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeSessionMap(map: Record<string, SessionEntry>): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(sessionFilePath(), JSON.stringify(map, null, 2), 'utf8')
  } catch (err) {
    console.warn('[platform-login] 写入本地会话失败:', err)
  }
}

/** 加密 cookies：safeStorage 可用时 'enc:'+base64，否则 'raw:'+明文 */
function encryptCookies(cookiesJson: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(cookiesJson).toString('base64')
  }
  return 'raw:' + cookiesJson
}

function decryptCookies(enc: string): string | null {
  try {
    if (enc.startsWith('enc:')) {
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.decryptString(Buffer.from(enc.slice(4), 'base64'))
    }
    if (enc.startsWith('raw:')) return enc.slice(4)
    return null
  } catch {
    return null
  }
}

function parseCookies(cookiesJson: string): CookieLike[] {
  try {
    const parsed = JSON.parse(cookiesJson) as CookieLike[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function toCookieHeader(cookiesJson: string): string {
  return parseCookies(cookiesJson)
    .filter((c) => c && typeof c.name === 'string' && typeof c.value === 'string')
    .map((c) => c.name + '=' + c.value)
    .join('; ')
}

/** 写入单个平台会话（setupLogin 与 saveSession 共用） */
function writeSession(platform: string, cookiesJson: string, displayName?: string): void {
  const map = readSessionMap()
  map[platform] = {
    enc: encryptCookies(cookiesJson),
    ...(typeof displayName === 'string' && displayName ? { displayName } : {}),
  }
  writeSessionMap(map)
}

/** 支持平台列表（含登录/发布/主页地址） */
export async function getSupportedPlatforms(): Promise<PlatformInfo[]> {
  return PLATFORMS.map(({ id, displayName, loginUrl, publishUrl, homeUrl }) => ({
    id,
    displayName,
    loginUrl,
    publishUrl,
    homeUrl,
  }))
}

/**
 * 弹出扫码登录窗口：
 * - 480x720 子窗口，父窗口为主窗口，隐藏菜单栏
 * - partition = persist:oral-platform-{platform}，与发布窗口同会话
 * - did-navigate 跳离登录页 host 视为登录完成（或 10 分钟超时）
 * - 收集全部 cookies → 加密写本地 → 尝试取 document.title 做 displayName
 */
export function setupLogin(platform: string): Promise<PlatformSetupLoginResult> {
  return new Promise((resolve) => {
    const preset = PLATFORMS.find((p) => p.id === platform)
    if (!preset) {
      resolve({ ok: false, error: '未知平台: ' + platform })
      return
    }

    const partition = 'persist:oral-platform-' + platform
    const parent = getMainWindow() ?? undefined
    const win = new BrowserWindow({
      width: 480,
      height: 720,
      parent,
      autoHideMenuBar: true,
      title: preset.displayName + ' · 扫码登录',
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    let settled = false
    const finish = (result: PlatformSetupLoginResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      try {
        win.destroy()
      } catch {
        /* 窗口可能已关闭 */
      }
      finish({ ok: false, error: '登录超时（10 分钟），请重新扫码' })
    }, 10 * 60 * 1000)

    win.on('closed', () => {
      // 部分平台为 SPA：扫码登录成功后不发生整页跳转，用户手动关闭窗口时
      // 只要已拿到会话 Cookie 即视为登录成功（避免丢失登录态）
      void (async () => {
        try {
          const ses = session.fromPartition(partition)
          const cookies = await ses.cookies.get({})
          if (cookies && cookies.length > 0) {
            const cookiesJson = JSON.stringify(cookies)
            let displayName = ''
            try {
              const title = await win.webContents.executeJavaScript('document.title')
              if (typeof title === 'string' && title.trim()) {
                displayName = title.replace(/\s+/g, ' ').trim().slice(0, 40)
              }
            } catch {
              /* 忽略 */
            }
            writeSession(platform, cookiesJson, displayName)
            finish({ ok: true, cookiesJson, displayName })
            return
          }
        } catch {
          /* 收集失败则按未登录处理 */
        }
        finish({ ok: false, error: '登录窗口已关闭，未获取到登录 Cookie' })
      })()
    })

    let loginHost = ''
    try {
      loginHost = new URL(preset.loginUrl).host
    } catch {
      loginHost = ''
    }

    const collectAndResolve = async (): Promise<void> => {
      try {
        const ses = session.fromPartition(partition)
        const cookies = await ses.cookies.get({})
        const cookiesJson = JSON.stringify(cookies)
        if (!cookies || cookies.length === 0) {
          finish({ ok: false, error: '未获取到登录 Cookie，请确认已登录成功' })
          return
        }
        let displayName = ''
        try {
          const title = await win.webContents.executeJavaScript('document.title')
          if (typeof title === 'string' && title.trim()) {
            displayName = title.replace(/\s+/g, ' ').trim().slice(0, 40)
          }
        } catch {
          /* 取不到标题则留空 */
        }
        writeSession(platform, cookiesJson, displayName)
        try {
          win.destroy()
        } catch {
          /* 忽略 */
        }
        finish({ ok: true, cookiesJson, displayName })
      } catch (err) {
        finish({ ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }

    win.webContents.on('did-navigate', (_event, url) => {
      if (settled) return
      let host = ''
      let protocol = ''
      try {
        const u = new URL(url)
        host = u.host
        protocol = u.protocol
      } catch {
        return
      }
      if (protocol !== 'http:' && protocol !== 'https:') return
      if (host === loginHost) return
      void collectAndResolve()
    })

    void win.loadURL(preset.loginUrl).catch((err) => {
      finish({ ok: false, error: '登录页加载失败: ' + (err instanceof Error ? err.message : String(err)) })
    })
  })
}

/** 测试本地会话：用 Cookie 请求主页，2xx=在线；401/302=失效 */
export async function testLogin(platform: string): Promise<PlatformTestLoginResult> {
  const preset = PLATFORMS.find((p) => p.id === platform)
  if (!preset) return { ok: false, error: '未知平台: ' + platform }
  const entry = readSessionMap()[platform]
  if (!entry?.enc) return { ok: false, error: '未找到本地登录会话' }
  const cookiesJson = decryptCookies(entry.enc)
  if (!cookiesJson) return { ok: false, error: '本地会话解密失败' }
  if (!/^https?:\/\//.test(preset.homeUrl)) return { ok: false, error: '平台主页地址无效' }

  const cookieHeader = toCookieHeader(cookiesJson)
  try {
    const res = await net.fetch(preset.homeUrl, {
      headers: cookieHeader ? { Cookie: cookieHeader } : {},
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    })
    if (res.status >= 200 && res.status < 300) {
      return { ok: true, online: true, status: res.status }
    }
    if (res.status === 401 || res.status === 302 || res.status === 303) {
      return { ok: true, online: false, status: res.status, message: '登录态失效，请重新扫码' }
    }
    return { ok: true, online: false, status: res.status }
  } catch (err) {
    return {
      ok: true,
      online: false,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

/** 系统浏览器打开平台主页 */
export async function openAccount(platform: string): Promise<void> {
  const preset = PLATFORMS.find((p) => p.id === platform)
  if (preset) await shell.openExternal(preset.homeUrl)
}

/** 用本地会话打开发布页（复用登录 partition）并尽力预填标题/描述/标签 */
export async function openPublish(
  platform: string,
  payload?: { title?: string; description?: string; tags?: string },
): Promise<{ ok: boolean; error?: string }> {
  const preset = PLATFORMS.find((p) => p.id === platform)
  if (!preset) return { ok: false, error: '未知平台: ' + platform }
  const entry = readSessionMap()[platform]
  if (!entry?.enc) return { ok: false, error: '未找到本地登录会话，请先扫码登录' }
  const cookiesJson = decryptCookies(entry.enc)
  if (!cookiesJson) return { ok: false, error: '本地会话解密失败' }

  const partition = 'persist:oral-platform-' + platform
  const ses = session.fromPartition(partition)
  const cookies = parseCookies(cookiesJson)
  let publishOrigin = ''
  try {
    publishOrigin = new URL(preset.publishUrl).origin
  } catch {
    publishOrigin = ''
  }
  for (const c of cookies) {
    try {
      let host = ''
      if (typeof c.domain === 'string' && c.domain) {
        host = c.domain.replace(/^\./, '')
      } else if (publishOrigin) {
        host = new URL(publishOrigin).host
      }
      if (!host) continue
      await ses.cookies.set({
        url: 'https://' + host,
        name: c.name,
        value: c.value,
        domain: typeof c.domain === 'string' && c.domain ? c.domain.replace(/^\./, '') : undefined,
        path: c.path || '/',
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        expirationDate: typeof c.expirationDate === 'number' ? c.expirationDate : undefined,
        sameSite: c.sameSite,
      })
    } catch {
      /* 单个 cookie 设置失败静默 */
    }
  }

  const parent = getMainWindow() ?? undefined
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    parent,
    autoHideMenuBar: true,
    title: preset.displayName + ' · 发布',
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  win.webContents.on('did-finish-load', () => {
    void prefillPublishForm(win, publishOrigin, payload).catch(() => undefined)
  })
  void win.loadURL(preset.publishUrl).catch((err) => {
    console.warn('[platform-login] 打开发布页失败:', err)
  })
  return { ok: true }
}

/** 发布页预填（仅同源自动注入，全部 try/catch 静默） */
async function prefillPublishForm(
  win: BrowserWindow,
  expectedOrigin: string,
  payload?: { title?: string; description?: string; tags?: string },
): Promise<void> {
  if (!payload) return
  const title = typeof payload.title === 'string' ? payload.title.trim() : ''
  const description = typeof payload.description === 'string' ? payload.description.trim() : ''
  const tags = typeof payload.tags === 'string' ? payload.tags.trim() : ''
  if (!title && !description && !tags) return

  const code = `(() => {
    const expectedOrigin = ${JSON.stringify(expectedOrigin)};
    if (expectedOrigin && location.origin !== expectedOrigin) return;
    const setValue = (el, value) => {
      if (!el || !value) return;
      try { el.focus && el.focus(); } catch {}
      try { el.value = value; } catch {}
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch {}
      try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch {}
    };
    const visible = (el) => {
      try { return el.offsetParent !== null || el.getClientRects().length > 0; } catch { return false; }
    };
    const title = ${JSON.stringify(title)};
    const description = ${JSON.stringify(description)};
    const tags = ${JSON.stringify(tags)};
    const textareas = Array.from(document.querySelectorAll('textarea')).filter(visible);
    const inputs = Array.from(document.querySelectorAll('input')).filter(visible);
    const descEl = description && (textareas[0] || inputs.find((i) => {
      const p = i.placeholder || '';
      const n = i.name || '';
      return /描述|简介|正文|description|content/i.test(p) || /description|content/i.test(n);
    }));
    setValue(descEl, description);
    const titleEl = title && inputs.find((i) => {
      const p = i.placeholder || '';
      const n = i.name || '';
      return /标题|title/i.test(p) || /title/i.test(n);
    });
    setValue(titleEl, title);
    const tagEl = tags && inputs.find((i) => {
      const p = i.placeholder || '';
      const n = i.name || '';
      return /标签|话题|tag/i.test(p) || /tag/i.test(n);
    });
    setValue(tagEl, tags);
  })();`
  try {
    await win.webContents.executeJavaScript(code)
  } catch {
    /* 预填失败静默 */
  }
}

/** 保存本地会话（外部调用，如渲染层回填） */
export function saveSession(
  platform: string,
  cookiesJson: string,
  displayName?: string,
): { ok: boolean; error?: string } {
  if (!PLATFORMS.some((p) => p.id === platform)) return { ok: false, error: '未知平台: ' + platform }
  if (typeof cookiesJson !== 'string' || !cookiesJson.trim()) {
    return { ok: false, error: 'cookiesJson 不能为空' }
  }
  writeSession(platform, cookiesJson, typeof displayName === 'string' ? displayName : undefined)
  return { ok: true }
}

/** 移除本地会话 */
export function removeSession(platform: string): { ok: boolean } {
  const map = readSessionMap()
  if (map[platform]) {
    delete map[platform]
    writeSessionMap(map)
  }
  return { ok: true }
}

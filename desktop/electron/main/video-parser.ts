/**
 * 桌面端本地视频解析器（对标轻语IP智能体 video-parser）
 *
 * 机制与轻语一致：
 *  1. 读取链接：extract-url（分享文本→URL）+ validate-url（平台正则校验）
 *  2. 打开页面：用 Electron 内置 Chromium 打开平台链接（复用扫码登录分区 persist:oral-platform-<platform>）
 *  3. 抓视频：等待 video[src] 元素（视频号 blob 选择器同样生效）+ 拦截网络媒体响应
 *  4. 下载：http(s) 直链流式下载；blob: 在页面内 fetch→arrayBuffer→分块回传落盘
 *
 * 解析出的本地视频文件由渲染进程上传后端 /oral-workshop/extract-file 完成 ffmpeg 抽音频 + STT 提取文案。
 */
import { app, BrowserWindow, ipcMain, net, session, type WebContents } from 'electron'
import { createWriteStream, openSync, closeSync, writeSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep, extname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import type { VideoParseResult } from '../shared/types'
import {
  extractUrlFromText,
  detectPlatform,
  validateVideoUrl,
  platformLabel,
  type VideoPlatform,
} from './video-parser-utils'

export { extractUrlFromText, detectPlatform, validateVideoUrl, platformLabel }

/** 模拟 Chrome 143（与轻语内置 Chromium 同代） */
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

/** 解析产物目录（仅允许 IPC 读取此目录下的文件，防任意文件读取） */
function parserTempRoot(): string {
  return join(app.getPath('temp'), 'shentong-video-parser')
}

function mediaOutputPath(url: string): string {
  const dir = parserTempRoot()
  mkdirSync(dir, { recursive: true })
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16)
  let ext = '.mp4'
  try {
    const ext2 = extname(new URL(url).pathname).toLowerCase()
    if (/^\.(mp4|mov|avi|mkv|flv|webm|m4a|mp3|wav|aac)$/.test(ext2)) ext = ext2
  } catch {
    /* 忽略非法 URL */
  }
  return join(dir, hash + ext)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** http(s) 直链下载（net.request 自动跟随重定向，覆盖 v.douyin.com 短链） */
function downloadHttp(url: string, filePath: string, referer?: string, timeoutMs = 180000): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    let settled = false
    const req = net.request({
      url,
      headers: {
        'User-Agent': CHROME_UA,
        Accept: '*/*',
        ...(referer ? { Referer: referer } : {}),
      },
    })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        req.abort()
      } catch {
        /* 已结束 */
      }
      reject(new Error('下载超时（' + Math.round(timeoutMs / 1000) + ' 秒）'))
    }, timeoutMs)
    req.on('response', (res) => {
      if (res.statusCode >= 400) {
        settled = true
        clearTimeout(timer)
        reject(new Error('媒体下载失败 HTTP ' + res.statusCode))
        return
      }
      const out = createWriteStream(filePath)
      // Electron net 响应流仅支持事件，手动分块写入
      res.on('data', (chunk: Buffer) => {
        if (settled) return
        out.write(chunk)
      })
      res.on('end', () => {
        out.end()
      })
      out.on('finish', () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolvePromise()
      })
      out.on('error', (e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(e)
      })
      res.on('error', (e) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(e)
      })
    })
    req.on('error', (e) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(e)
    })
    req.end()
  })
}

/** blob: 下载：页面内 fetch→arrayBuffer→分块 base64 回传落盘（对标轻语 file:write-buffer 思路） */
async function downloadBlob(wc: WebContents, blobUrl: string, filePath: string): Promise<number> {
  const total = await wc.executeJavaScript(
    `(async () => {
      const r = await fetch(${JSON.stringify(blobUrl)});
      if (!r.ok) throw new Error('blob 读取失败 HTTP ' + r.status);
      const b = await r.arrayBuffer();
      window.__vpBlobBuf = b;
      return b.byteLength;
    })()`,
  )
  if (!total || typeof total !== 'number' || total <= 0) {
    throw new Error('blob 媒体为空')
  }
  const CHUNK = 8 * 1024 * 1024
  const fd = openSync(filePath, 'w')
  try {
    let offset = 0
    while (offset < total) {
      const b64 = await wc.executeJavaScript(
        `(() => {
          const b = window.__vpBlobBuf;
          const s = ${offset};
          const e = Math.min(b.byteLength, ${offset + CHUNK});
          const u8 = new Uint8Array(b.slice(s, e));
          let bin = '';
          const step = 32768;
          for (let i = 0; i < u8.length; i += step) {
            bin += String.fromCharCode.apply(null, u8.subarray(i, i + step));
          }
          return btoa(bin);
        })()`,
      )
      const buf = Buffer.from(String(b64 || ''), 'base64')
      if (!buf.length) throw new Error('blob 分块读取失败')
      writeSync(fd, buf, 0, buf.length, offset)
      offset += buf.length
    }
  } finally {
    closeSync(fd)
  }
  return total
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** 等待页面出现可用的 video[src]，必要时触发播放（对标轻语 waitForSelector('video[src]')） */
async function waitForVideoSrc(wc: WebContents, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  let played = false
  while (Date.now() < deadline) {
    try {
      const r = (await wc.executeJavaScript(
        `(() => {
          const v = document.querySelector('video');
          if (!v) return { found: false };
          const src = v.currentSrc || v.src || '';
          return { found: !!src, src };
        })()`,
      )) as { found: boolean; src: string }
      if (r && r.found && r.src) return r.src
    } catch {
      /* 页面尚未就绪，继续轮询 */
    }
    if (!played) {
      played = true
      try {
        await wc.executeJavaScript(
          `(() => {
            const v = document.querySelector('video');
            if (v) {
              v.muted = true;
              try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
              try { v.scrollIntoView({ block: 'center' }); } catch (e) {}
            }
          })()`,
        )
      } catch {
        /* 忽略 */
      }
    }
    await sleep(800)
  }
  return null
}

/** 读取页面标题/封面/时长 */
async function readPageInfo(
  wc: WebContents,
): Promise<{ title: string; coverUrl: string; duration: number }> {
  try {
    const r = (await wc.executeJavaScript(
      `(() => {
        const v = document.querySelector('video');
        const meta = document.querySelector('meta[property="og:image"]');
        return {
          title: document.title || '',
          cover: (v && v.poster) || (meta && meta.getAttribute('content')) || '',
          duration: v && Number.isFinite(v.duration) ? v.duration : 0
        };
      })()`,
    )) as { title: string; cover: string; duration: number }
    return { title: r?.title || '', coverUrl: r?.cover || '', duration: Number(r?.duration) || 0 }
  } catch {
    return { title: '', coverUrl: '', duration: 0 }
  }
}

/** 读取页面可见文本（用于识别“可扫码前往微信观看”等拦截页） */
async function readPageText(wc: WebContents): Promise<string> {
  try {
    const t = (await wc.executeJavaScript(
      `(() => (document.body ? document.body.innerText : '')).replace(/\\s+/g, ' ').slice(0, 600)`,
    )) as string
    return typeof t === 'string' ? t : ''
  } catch {
    return ''
  }
}

/** 解析平台链接 → 本地视频文件（核心入口，对标轻语 video-parser:parse） */
export async function parseVideo(rawUrl: string): Promise<VideoParseResult> {
  const url = String(rawUrl || '').trim()
  if (!/^https?:\/\//i.test(url)) {
    return { ok: false, error: '仅支持 http/https 链接或 mp4/mov 等视频直链' }
  }
  const platform = detectPlatform(url)

  // 直链：无需浏览器，直接下载
  if (platform === 'direct') {
    const out = mediaOutputPath(url)
    try {
      await downloadHttp(url, out)
      if (!statSync(out).size) throw new Error('下载结果为空')
      let title = url
      try {
        title = basename(new URL(url).pathname) || url
      } catch {
        /* 忽略 */
      }
      return { ok: true, videoPath: out, title, platform, mediaUrl: url }
    } catch (err) {
      return { ok: false, error: '视频直链下载失败: ' + errorMessage(err), platform }
    }
  }

  // 浏览器方案：复用平台扫码登录分区（persist:oral-platform-<platform>）
  const partition = 'persist:oral-platform-' + platform
  let win: BrowserWindow | null = null
  let ses: ReturnType<typeof session.fromPartition> | null = null
  let onResponseStarted: ((details: Electron.OnResponseStartedListenerDetails) => void) | null = null
  const mediaHits: string[] = []
  try {
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      autoHideMenuBar: true,
      webPreferences: {
        partition,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webSecurity: true,
      },
    })
    win.webContents.setUserAgent(CHROME_UA)
    const wc = win.webContents
    ses = session.fromPartition(partition)

    // 拦截网络媒体响应（对标轻语 parseResourceResponse）
    onResponseStarted = (details: Electron.OnResponseStartedListenerDetails): void => {
      try {
        const headers = details.responseHeaders || {}
        let ct = ''
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === 'content-type' && v && v[0]) {
            ct = v[0]
            break
          }
        }
        if (/^video\//i.test(ct) || /\.(mp4|flv|m3u8)(\?|$)/i.test(details.url)) {
          mediaHits.push(details.url)
        }
      } catch {
        /* 忽略单条 */
      }
    }
    ses.webRequest.onResponseStarted(onResponseStarted)

    try {
      await wc.loadURL(url, { userAgent: CHROME_UA })
    } catch {
      /* 部分页面 loadURL 报错但实际已加载，继续等待 */
    }

    let mediaUrl: string | null = null
    const timeoutMs = 90000
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const src = await waitForVideoSrc(wc, Math.min(15000, deadline - Date.now()))
      if (src) {
        mediaUrl = src
        break
      }
      if (mediaHits.length) break
      await sleep(800)
    }
    if (!mediaUrl && mediaHits.length) mediaUrl = mediaHits[0]

    const pageText = await readPageText(wc)
    if (!mediaUrl) {
      const wallHint =
        pageText.includes('可扫码前往微信观看') || pageText.includes('前往微信观看')
          ? '该视频在网页端不可播放（仅微信内可看）。请在微信中打开后保存/转发视频文件，再使用「上传文件提取文案」。'
          : ''
      return {
        ok: false,
        error:
          wallHint ||
          '未在页面中找到可播放的视频（可能需扫码登录或链接已失效）' +
            (platformLabel(platform) !== '未知平台' ? '（' + platformLabel(platform) + '）' : ''),
        platform,
        pageText: pageText.slice(0, 300),
      }
    }

    const out = mediaOutputPath(mediaUrl)
    try {
      if (mediaUrl.startsWith('blob:')) {
        await downloadBlob(wc, mediaUrl, out)
      } else {
        await downloadHttp(mediaUrl, out, url)
      }
    } catch (err) {
      return { ok: false, error: '媒体下载失败: ' + errorMessage(err), platform }
    }
    if (!statSync(out).size) return { ok: false, error: '媒体下载为空', platform }

    const info = await readPageInfo(wc)
    let title = info.title || url
    try {
      if (!info.title) title = basename(new URL(url).pathname) || url
    } catch {
      /* 忽略 */
    }
    return {
      ok: true,
      videoPath: out,
      title,
      coverUrl: info.coverUrl || undefined,
      duration: info.duration || undefined,
      platform,
      mediaUrl,
    }
  } catch (err) {
    return { ok: false, error: '本地解析失败: ' + errorMessage(err), platform }
  } finally {
    try {
      if (ses && onResponseStarted) {
        ses.webRequest.onResponseStarted(null)
      }
    } catch {
      /* 忽略 */
    }
    if (win && !win.isDestroyed()) {
      try {
        win.destroy()
      } catch {
        /* 忽略 */
      }
    }
  }
}

/** 读取解析产物（仅限解析目录，防任意文件读取） */
export function readParsedFile(filePath: string): ArrayBuffer | null {
  const root = parserTempRoot()
  const resolved = resolve(filePath)
  if (!resolved.startsWith(root + sep)) return null
  try {
    const buf = readFileSync(resolved)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  } catch {
    return null
  }
}

/** 注册 IPC（对标轻语 videoParserIpc：extract-url / validate-url / parse） */
export function registerVideoParserIpc(): void {
  ipcMain.handle('video-parser:extract-url', (_e, text: string) =>
    extractUrlFromText(typeof text === 'string' ? text : ''),
  )
  ipcMain.handle('video-parser:validate-url', (_e, url: string) =>
    validateVideoUrl(typeof url === 'string' ? url : ''),
  )
  ipcMain.handle('video-parser:parse', (_e, url: string) =>
    parseVideo(typeof url === 'string' ? url : ''),
  )
  ipcMain.handle('video-parser:read-file', (_e, filePath: string) =>
    readParsedFile(typeof filePath === 'string' ? filePath : ''),
  )
}

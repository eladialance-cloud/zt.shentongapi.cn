// 本地 n8n 编辑器界面汉化注入
//
// 背景：n8n 官方编辑器（1.62）只内置 en 语言包，登录后界面全英文。
// 方案：把 n8n-trans 社区汉化用户脚本（DOM 文本翻译 + MutationObserver 动态翻译，560+ 词条，
// 纯 JS 无 Tampermonkey API 依赖）注入到内嵌 n8n iframe，实现中文界面；
// 不修改 n8n 任何数据与功能，不翻译代码编辑器内容。

import { app, webContents } from 'electron'
import type { WebContents, WebFrameMain } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const N8N_ORIGIN = 'http://127.0.0.1:5678'

let scriptCache: string | null | undefined
let watcherStarted = false
/** 每个 iframe 最近一次注入时间（避免重复注入叠加多个 MutationObserver/定时器） */
const injectedAt = new Map<number, { url: string; at: number }>()

/** 读取汉化脚本源码：打包后位于 resources/n8n/n8n-chinese.js（extraResources），开发时位于项目 resources/ 目录 */
function loadScriptSource(): string | null {
  if (scriptCache !== undefined) return scriptCache
  const candidates: string[] = []
  try {
    candidates.push(join(process.resourcesPath, 'n8n', 'n8n-chinese.js'))
  } catch {
    // ignore
  }
  try {
    candidates.push(join(app.getAppPath(), 'resources', 'n8n', 'n8n-chinese.js'))
  } catch {
    // ignore
  }
  for (const file of candidates) {
    try {
      if (existsSync(file)) {
        const raw = readFileSync(file, 'utf8')
        // 去掉 UserScript 元数据头（@match 等），只保留 IIFE 主体
        scriptCache = raw.replace(/^\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\s*/m, '')
        return scriptCache
      }
    } catch {
      // ignore
    }
  }
  scriptCache = null
  return null
}

function framesOf(wc: WebContents): WebFrameMain[] {
  try {
    const main = wc.mainFrame
    return main ? main.frames.filter((f) => f.url.startsWith(N8N_ORIGIN)) : []
  } catch {
    return []
  }
}

function findN8nFrames(): WebFrameMain[] {
  const result: WebFrameMain[] = []
  for (const wc of webContents.getAllWebContents()) {
    result.push(...framesOf(wc))
  }
  return result
}

function findFrameByRoutingId(routingId: number): WebFrameMain | null {
  for (const wc of webContents.getAllWebContents()) {
    try {
      const frame = wc.mainFrame?.frames.find((f) => f.routingId === routingId)
      if (frame) return frame
    } catch {
      // ignore
    }
  }
  return null
}

function injectFrame(frame: WebFrameMain): boolean {
  const source = loadScriptSource()
  if (!source) return false
  const now = Date.now()
  const prev = injectedAt.get(frame.routingId)
  // 30 秒冷却：同一 iframe 不重复注入；URL 变化（整页重新加载）立即重新注入
  if (prev && prev.url === frame.url && now - prev.at < 30000) {
    return false
  }
  try {
    // userGesture=true，与用户手动在控制台执行等效
    frame.executeJavaScript(source, true).catch(() => {
      // 汉化脚本内部异常不影响 App
    })
    injectedAt.set(frame.routingId, { url: frame.url, at: now })
    return true
  } catch (err) {
    console.error('[n8n-i18n] 注入汉化脚本失败:', err)
    return false
  }
}

function tryInjectAll(): void {
  for (const frame of findN8nFrames()) {
    injectFrame(frame)
  }
}

/**
 * 启动 n8n 界面汉化注入（幂等）：
 * 1. 监听所有 WebContents 的 iframe 加载完成事件（含未来新建的 WebContents），
 *    n8n iframe 每次加载完成即注入；
 * 2. 启动时立即扫描一次已存在的 n8n iframe；
 * 3. 兜底轮询 2 分钟，覆盖 iframe 晚于 n8n 服务就绪的场景。
 */
export function ensureN8nI18n(): void {
  if (watcherStarted) return
  watcherStarted = true

  const attach = (wc: WebContents): void => {
    try {
      wc.on('did-frame-finish-load', (_event, _isMainFrame, _frameProcessId, frameRoutingId) => {
        const frame = findFrameByRoutingId(frameRoutingId)
        if (frame) injectFrame(frame)
      })
    } catch {
      // ignore
    }
  }

  for (const wc of webContents.getAllWebContents()) attach(wc)
  app.on('web-contents-created', (_event, wc) => attach(wc))

  tryInjectAll()
  const timer = setInterval(tryInjectAll, 5000)
  setTimeout(() => clearInterval(timer), 2 * 60 * 1000)
}

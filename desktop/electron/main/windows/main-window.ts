// 主窗口管理

import { app, BrowserWindow, shell, session } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ServiceManager } from '../service-manager'
import { isAllowedWebviewUrl, hardenWebviewPreferences, hardenAttachedWebContents } from '../security'

let mainWindow: BrowserWindow | null = null
let isQuitting = false
let webviewHardenRegistered = false

/** 标记应用正在退出，允许窗口真正关闭（而非最小化到托盘） */
export function setQuitting(value: boolean): void {
  isQuitting = value
}

export function createMainWindow(_serviceManager: ServiceManager, isDev: boolean): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    title: '深瞳AI',
    backgroundColor: '#f1f5f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 关闭主窗口时最小化到托盘（不退出应用）
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  // 外部链接在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // P0-2: 阻止窗口内导航到应用之外的地址（http/https/自定义协议等），防止钓鱼/远程页面顶替应用
  // 仅放行应用自身 index.html（含 hash/query）与 dev server 地址；其它 file:// 一律拒绝
  const appIndexUrl = pathToFileURL(join(__dirname, '../renderer/index.html')).href.toLowerCase()
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const lower = url.toLowerCase()
    const isAllowed =
      lower === appIndexUrl ||
      lower.startsWith(appIndexUrl + '#') ||
      lower.startsWith(appIndexUrl + '?') ||
      (isDev && !!process.env['ELECTRON_RENDERER_URL'] && lower.startsWith(process.env['ELECTRON_RENDERER_URL'].toLowerCase()))
    if (!isAllowed) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Web 预览 <webview>：仅放行 web-preview 分区，并强制安全偏好（对齐上游 security.ts）
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const isWebPreview = params.partition === 'web-preview'
    if (!isAllowedWebviewUrl(params.src, isWebPreview)) {
      event.preventDefault()
      console.warn('[SECURITY] Blocked webview attachment for untrusted URL')
      return
    }
    hardenWebviewPreferences(webPreferences)
  })

  // 对所有 webview 来宾内容统一收紧窗口打开/导航（web 预览除外）
  if (!webviewHardenRegistered) {
    webviewHardenRegistered = true
    app.on('web-contents-created', (_event, contents) => {
      if (contents.getType() === 'webview') {
        const isWebPreview = contents.session === session.fromPartition('web-preview')
        hardenAttachedWebContents(contents, isWebPreview)
      }
    })
  }

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function destroyMainWindow(): void {
  mainWindow = null
}

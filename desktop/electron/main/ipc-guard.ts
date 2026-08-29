// IPC 安全守卫：只允许主窗口顶层页面（应用自身 file:// 或开发服务器地址）调用主进程 IPC。
// 防止页面被导航到远程站点、被注入恶意脚本后滥用 preload 暴露的通道。
import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 应用自身 index.html（生产环境唯一可信页面） */
const APP_INDEX_URL = pathToFileURL(join(__dirname, '../renderer/index.html')).href.toLowerCase()

let mainWindowProvider: () => BrowserWindow | null = () => null
let devMode = false

/** 在创建主窗口前调用：注入主窗口提供器与开发模式标记 */
export function initIpcGuard(provider: () => BrowserWindow | null, isDev: boolean): void {
  mainWindowProvider = provider
  devMode = isDev
}

function isTrustedSender(sender: Electron.WebContents, frame: Electron.WebFrameMain | null): boolean {
  if (!frame || !sender) return false
  // 只接受主窗口的主 frame（iframe / 子窗口一律拒绝）
  if (frame !== sender.mainFrame) return false
  const win = mainWindowProvider()
  if (!win || win.isDestroyed() || win.webContents !== sender) return false
  const url = (frame.url || '').toLowerCase()
  if (!url) return false
  // 生产环境：仅放行应用自身 index.html（含 hash/query），其它 file:// 一律拒绝
  if (url === APP_INDEX_URL || url.startsWith(APP_INDEX_URL + '#') || url.startsWith(APP_INDEX_URL + '?')) return true
  // 开发环境：允许 vite dev server
  if (devMode) {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl && url.startsWith(devUrl.toLowerCase())) return true
  }
  return false
}

/** 在注册任何 IPC 通道之前调用：包装 ipcMain.handle / ipcMain.on，统一校验调用来源 */
export function hardenIpc(): void {
  const origHandle = ipcMain.handle.bind(ipcMain)
  const origOn = ipcMain.on.bind(ipcMain)
  const origRemoveHandler = ipcMain.removeHandler.bind(ipcMain)

  ipcMain.handle = ((channel: string, listener: (...args: unknown[]) => unknown) => {
    return origHandle(channel, (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!isTrustedSender(event.sender, event.senderFrame)) {
        console.warn(
          '[ipc-guard] 拒绝不可信来源的 IPC invoke: ' + channel + ' (frame=' + (event.senderFrame?.url ?? 'unknown') + ')',
        )
        throw new Error('IPC channel "' + channel + '" is not allowed from this frame')
      }
      return listener(event, ...args)
    })
  }) as typeof ipcMain.handle

  ipcMain.on = ((channel: string, listener: (...args: unknown[]) => void) => {
    return origOn(channel, (event: Electron.IpcMainEvent, ...args: unknown[]) => {
      if (!isTrustedSender(event.sender, event.senderFrame)) {
        console.warn(
          '[ipc-guard] 拒绝不可信来源的 IPC on: ' + channel + ' (frame=' + (event.senderFrame?.url ?? 'unknown') + ')',
        )
        return
      }
      return listener(event, ...args)
    })
  }) as typeof ipcMain.on

  // 保持 removeHandler 行为不变（按通道名移除，仍命中原始注册）
  ipcMain.removeHandler = origRemoveHandler
}

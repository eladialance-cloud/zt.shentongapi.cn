// 系统托盘

import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { ServiceManager } from './service-manager'
import type { ServiceName, ServiceStatus } from '../shared/types'
import { setQuitting } from './windows/main-window'

let tray: Tray | null = null
let menuRefreshTimer: NodeJS.Timeout | null = null

const STATUS_LABEL: Record<ServiceStatus, string> = {
  running: '🟢 运行中',
  stopped: '🔴 已停止',
  starting: '🟡 启动中',
  error: '🔴 异常',
  unknown: '⚪ 未知'
}

function resolveIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', 'icon.png')
    : join(__dirname, '../../resources/icon.png')
}

function showMainWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

function buildContextMenu(mainWindow: BrowserWindow, serviceManager: ServiceManager): Menu {
  const allStatus = serviceManager.getAllStatus()
  const serviceEntries: { name: ServiceName; label: string }[] = [
    { name: 'openclaw', label: 'OpenClaw' },
    { name: 'n8n', label: 'N8N' },
    { name: 'mcp', label: 'MCP' }
  ]

  return Menu.buildFromTemplate([
    {
      label: '打开主界面',
      click: () => showMainWindow(mainWindow)
    },
    { type: 'separator' },
    {
      label: '服务状态',
      submenu: serviceEntries.map((entry) => ({
        label: `${entry.label}: ${STATUS_LABEL[allStatus[entry.name]]}`,
        enabled: false
      }))
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        setQuitting(true)
        app.quit()
      }
    }
  ])
}

/** 创建系统托盘 */
export function createTray(mainWindow: BrowserWindow, serviceManager: ServiceManager): Tray {
  const iconPath = resolveIconPath()
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty()
  }

  tray = new Tray(icon)
  tray.setToolTip('深瞳AI')

  const refreshMenu = (): void => {
    if (tray) {
      tray.setContextMenu(buildContextMenu(mainWindow, serviceManager))
    }
  }
  refreshMenu()

  // 定时刷新菜单以反映服务状态变化
  menuRefreshTimer = setInterval(refreshMenu, 5000)

  // 单击托盘图标恢复主窗口
  tray.on('click', () => {
    showMainWindow(mainWindow)
  })

  // 双击托盘图标打开主窗口
  tray.on('double-click', () => {
    showMainWindow(mainWindow)
  })

  return tray
}

/** 销毁托盘 */
export function destroyTray(): void {
  if (menuRefreshTimer) {
    clearInterval(menuRefreshTimer)
    menuRefreshTimer = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
}

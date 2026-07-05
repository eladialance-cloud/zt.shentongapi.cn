// Electron 主进程入口

import { app, BrowserWindow, ipcMain } from 'electron'
import { createMainWindow, getMainWindow, setQuitting } from './windows/main-window'
import { createTray, destroyTray } from './tray'
import { ServiceManager } from './service-manager'
import { AppUpdater } from './updater'
import { getDeviceFingerprint } from './device'
import { localDb } from './local-db'
import { getOrCreateSalt, deriveDbKey } from './local-db/crypto'
import { verifyAll, verifyIntegrity } from './runtime-resolver'
import { download as downloadRuntime, cancelDownload } from './runtime-downloader'
import type { ServiceName, SyncQueueItem, SyncQueueRow } from '../shared/types'

const serviceManager = new ServiceManager()
const isDev = !app.isPackaged
let appUpdater: AppUpdater | null = null

// 单实例锁 - 防止多开
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getMainWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.shentong.ai')

    const mainWindow = createMainWindow(serviceManager, isDev)
    createTray(mainWindow, serviceManager)
    // 自动更新：启动时实例化并检查更新（Task 35.3）
    appUpdater = new AppUpdater(mainWindow)
    appUpdater.checkForUpdates()
    registerIpcHandlers()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow(serviceManager, isDev)
      }
    })
  })

  // 应用退出前标记，允许窗口真正关闭
  app.on('before-quit', () => {
    setQuitting(true)
    void serviceManager.stopAll()
  })

  app.on('will-quit', () => {
    destroyTray()
  })
}

// 主窗口全部关闭时不退出（最小化到托盘），macOS 标准行为
app.on('window-all-closed', () => {
  // 由托盘 + close 拦截处理，这里不做退出
})

/** 注册 IPC 处理器 */
function registerIpcHandlers(): void {
  // 服务管理
  ipcMain.handle('service:getStatus', () => serviceManager.getAllStatus())
  ipcMain.handle('service:status', (_event, name: ServiceName) =>
    serviceManager.getInfo(name)
  )
  ipcMain.handle('service:list', () => serviceManager.getAllInfo())
  ipcMain.handle('service:start', (_event, name: ServiceName) => serviceManager.start(name))
  ipcMain.handle('service:stop', (_event, name: ServiceName) => serviceManager.stop(name))
  ipcMain.handle('service:restart', (_event, name: ServiceName) => serviceManager.restart(name))
  ipcMain.handle('service:checkEnv', () => serviceManager.checkEnvironment())
  ipcMain.handle('service:install', (_event, name: ServiceName) => serviceManager.install(name))

  // 服务状态变更 → 转发到渲染进程
  serviceManager.on('status-changed', (name: ServiceName, status: string, info: unknown) => {
    const payload = { name, status, info }
    getMainWindow()?.webContents.send('service:status-changed', payload)
  })
  // 服务错误事件 → 转发到渲染进程
  serviceManager.on('service-error', (payload: unknown) => {
    getMainWindow()?.webContents.send('service:error', payload)
  })

  // 应用信息与更新
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:checkUpdate', () => {
    appUpdater?.checkForUpdates()
    return Promise.resolve()
  })
  ipcMain.handle('app:quitAndInstall', () => {
    appUpdater?.installUpdate()
    return Promise.resolve()
  })

  // 自动更新（Task 35.3）- update:status 为主进程主动推送，无需 handle
  ipcMain.handle('update:check', () => {
    appUpdater?.checkForUpdates()
    return Promise.resolve()
  })
  ipcMain.handle('update:download', () => {
    appUpdater?.downloadUpdate()
    return Promise.resolve()
  })
  ipcMain.handle('update:install', () => {
    appUpdater?.installUpdate()
    return Promise.resolve()
  })

  // 设备指纹（返回指纹哈希字符串，保持 preload 契约 Promise<string>）
  ipcMain.handle('device:getFingerprint', async () => (await getDeviceFingerprint()).fingerprint)

  // 窗口控制
  ipcMain.on('window:minimize', () => getMainWindow()?.minimize())
  ipcMain.on('window:maximize', () => {
    const win = getMainWindow()
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on('window:close', () => getMainWindow()?.close())

  // 本地数据库（SQLCipher 加密）
  // 登录后调用：从 userToken + salt 派生密钥，初始化数据库；失败则进入降级模式
  ipcMain.handle('db:initialize', async (_event, userToken: string): Promise<boolean> => {
    try {
      const salt = getOrCreateSalt()
      const key = deriveDbKey(userToken, salt)
      await localDb.initialize(key)
      return !localDb.isDegraded()
    } catch (err) {
      console.error('[ipc] db:initialize failed:', err)
      return false
    }
  })

  // 同步查询降级状态（渲染进程通过 sendSync 调用）
  ipcMain.on('db:isDegraded', (event) => {
    event.returnValue = localDb.isDegraded()
  })

  // 登出时关闭数据库（fire-and-forget）
  ipcMain.on('db:close', () => {
    localDb.close()
  })

  // 降级事件转发到渲染进程，由其显示提示并回退到云端 API
  localDb.on('db:degraded', (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[ipc] db:degraded forwarded to renderer:', message)
    getMainWindow()?.webContents.send('db:degraded', { message })
  })

  // ===== 同步队列操作（离线调用队列 + 上行同步） =====
  // 降级模式下返回空结果，渲染进程据此走云端 API

  ipcMain.handle('syncQueue:enqueue', async (_event, item: SyncQueueItem): Promise<number> => {
    if (localDb.isDegraded()) return -1
    try {
      const result = await localDb.run(
        `INSERT INTO local_sync_queue (client_txn_id, entity_type, entity_id, operation, payload, status, retry_count)
         VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
        [item.client_txn_id, item.entity_type, item.entity_id, item.operation, JSON.stringify(item.payload)]
      )
      return result.lastID
    } catch (err) {
      console.error('[ipc] syncQueue:enqueue failed:', err)
      return -1
    }
  })

  ipcMain.handle('syncQueue:getPending', async (_event, limit: number): Promise<SyncQueueRow[]> => {
    if (localDb.isDegraded()) return []
    try {
      const rows = await localDb.all<SyncQueueRow>(
        `SELECT * FROM local_sync_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
        [limit]
      )
      // payload 字段反序列化
      return rows.map((row) => ({
        ...row,
        payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload
      }))
    } catch (err) {
      console.error('[ipc] syncQueue:getPending failed:', err)
      return []
    }
  })

  ipcMain.handle(
    'syncQueue:updateStatus',
    async (_event, id: number, status: 'synced' | 'failed' | 'pending', retryCount: number, errorMessage?: string): Promise<void> => {
      if (localDb.isDegraded()) return
      try {
        const syncedAt = status === 'synced' ? new Date().toISOString() : null
        await localDb.run(
          `UPDATE local_sync_queue SET status = ?, retry_count = ?, error_message = ?, synced_at = COALESCE(?, synced_at) WHERE id = ?`,
          [status, retryCount, errorMessage ?? null, syncedAt, id]
        )
      } catch (err) {
        console.error('[ipc] syncQueue:updateStatus failed:', err)
      }
    }
  )

  ipcMain.handle('syncQueue:exists', async (_event, client_txn_id: string): Promise<boolean> => {
    if (localDb.isDegraded()) return false
    try {
      const row = await localDb.get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM local_sync_queue WHERE client_txn_id = ?`,
        [client_txn_id]
      )
      return (row?.c ?? 0) > 0
    } catch (err) {
      console.error('[ipc] syncQueue:exists failed:', err)
      return false
    }
  })

  // ===== 运行时校验与下载（Task 8 - 内置本地服务运行时） =====

  // 校验所有服务运行时完整性（SHA-256）
  ipcMain.handle('runtime:verify', async () => {
    const results = await verifyAll()
    return { results, allPassed: Object.values(results).every(Boolean) }
  })

  // 校验单个服务运行时完整性
  ipcMain.handle('runtime:verify-one', async (_event, name: ServiceName) => {
    return await verifyIntegrity(name)
  })

  // 下载服务运行时到 userData 目录（含进度推送与 SHA-256 校验）
  ipcMain.handle('runtime:download', async (event, name: ServiceName) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const ok = await downloadRuntime(name, (progress) => {
      win?.webContents.send('runtime:download-progress', {
        name,
        ...progress
      })
    })
    return ok
  })

  // 取消正在进行的下载（保留临时文件以便断点续传）
  ipcMain.handle('runtime:cancel-download', async (_event, name: ServiceName) => {
    cancelDownload(name)
    return true
  })
}

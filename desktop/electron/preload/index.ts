// 预加载脚本 - 通过 contextBridge 暴露安全 API 给渲染进程
// 启用 contextIsolation: true，nodeIntegration: false

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  ServiceName,
  ServiceInfo,
  ServiceStatusChangedPayload,
  ServiceErrorPayload,
  SyncQueueRow,
  UpdateStatusPayload,
  ElectronAPI,
  RuntimeAPI,
  RuntimeDownloadProgress
} from '../shared/types'

const electronAPI: ElectronAPI = {
  service: {
    getStatus: () => ipcRenderer.invoke('service:getStatus'),
    status: (name: ServiceName) =>
      ipcRenderer.invoke('service:status', name) as Promise<ServiceInfo>,
    list: () => ipcRenderer.invoke('service:list') as Promise<ServiceInfo[]>,
    start: (name: ServiceName) => ipcRenderer.invoke('service:start', name),
    stop: (name: ServiceName) => ipcRenderer.invoke('service:stop', name),
    restart: (name: ServiceName) => ipcRenderer.invoke('service:restart', name),
    checkEnv: () => ipcRenderer.invoke('service:checkEnv'),
    install: (name: ServiceName) => ipcRenderer.invoke('service:install', name),
    onStatusChanged: (callback: (payload: ServiceStatusChangedPayload) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: ServiceStatusChangedPayload
      ): void => callback(payload)
      ipcRenderer.on('service:status-changed', handler)
      return () => {
        ipcRenderer.removeListener('service:status-changed', handler)
      }
    },
    onError: (callback: (payload: ServiceErrorPayload) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: ServiceErrorPayload
      ): void => callback(payload)
      ipcRenderer.on('service:error', handler)
      return () => {
        ipcRenderer.removeListener('service:error', handler)
      }
    }
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    checkUpdate: () => ipcRenderer.invoke('app:checkUpdate'),
    quitAndInstall: () => ipcRenderer.invoke('app:quitAndInstall')
  },
  updater: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    onStatus: (callback: (payload: UpdateStatusPayload) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: UpdateStatusPayload
      ): void => callback(payload)
      ipcRenderer.on('update:status', handler)
      return () => {
        ipcRenderer.removeListener('update:status', handler)
      }
    }
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },
  device: {
    getFingerprint: () => ipcRenderer.invoke('device:getFingerprint')
  },
  db: {
    // 登录后调用：派生密钥 → 初始化 SQLCipher；失败返回 false（降级模式）
    initialize: (userToken: string) => ipcRenderer.invoke('db:initialize', userToken) as Promise<boolean>,
    // 同步查询降级状态（sendSync 阻塞，仅读布尔值，开销极小）
    isDegraded: () => ipcRenderer.sendSync('db:isDegraded') as boolean,
    // 登出时关闭数据库（fire-and-forget）
    close: () => {
      ipcRenderer.send('db:close')
    }
  },
  syncQueue: {
    enqueue: (item) => ipcRenderer.invoke('syncQueue:enqueue', item) as Promise<number>,
    getPending: (limit) => ipcRenderer.invoke('syncQueue:getPending', limit) as Promise<SyncQueueRow[]>,
    updateStatus: (id, status, retryCount, errorMessage) =>
      ipcRenderer.invoke('syncQueue:updateStatus', id, status, retryCount, errorMessage) as Promise<void>,
    exists: (client_txn_id) => ipcRenderer.invoke('syncQueue:exists', client_txn_id) as Promise<boolean>
  }
}

const runtimeAPI: RuntimeAPI = {
  verify: () => ipcRenderer.invoke('runtime:verify'),
  verifyOne: (name: ServiceName) => ipcRenderer.invoke('runtime:verify-one', name),
  download: (name: ServiceName) => ipcRenderer.invoke('runtime:download', name),
  cancelDownload: (name: ServiceName) => ipcRenderer.invoke('runtime:cancel-download', name),
  onDownloadProgress: (callback: (progress: RuntimeDownloadProgress) => void) => {
    const handler = (
      _event: IpcRendererEvent,
      progress: RuntimeDownloadProgress
    ): void => callback(progress)
    ipcRenderer.on('runtime:download-progress', handler)
    return () => {
      ipcRenderer.removeListener('runtime:download-progress', handler)
    }
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
    contextBridge.exposeInMainWorld('runtime', runtimeAPI)
  } catch (err) {
    console.error('[preload] exposeInMainWorld failed:', err)
  }
} else {
  // @ts-expect-error fallback when context isolation disabled
  window.electronAPI = electronAPI
  // @ts-expect-error fallback when context isolation disabled
  window.runtime = runtimeAPI
}

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
  RuntimeDownloadProgress,
  InstallProgressPayload,
  MarketItemType,
  InstalledRecord,
  MarketItemDetail,
  OpenClawChatMessage,
  OpenClawChatMessagePayload,
  LlmIntegration,
  OpenClawToolCall,
  OpenClawChatDonePayload,
  OpenClawChatLifecyclePayload,
  OpenClawChatErrorPayload
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
    getRuntimeDir: () => ipcRenderer.invoke('service:get-runtime-dir'),
    chooseRuntimeDir: () => ipcRenderer.invoke('service:set-runtime-dir'),
    onInstallProgress: (callback: (payload: InstallProgressPayload) => void) => {
      const handler = (
        _event: IpcRendererEvent,
        payload: InstallProgressPayload
      ): void => callback(payload)
      ipcRenderer.on('service:install-progress', handler)
      return () => {
        ipcRenderer.removeListener('service:install-progress', handler)
      }
    },
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
    quitAndInstall: () => ipcRenderer.invoke('app:quitAndInstall'),
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    disableHardwareAcceleration: () => ipcRenderer.invoke('office:disable-hardware-acceleration')
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
  market: {
    install: (type: MarketItemType, id: number, name: string, version: string, pkg: Record<string, unknown>) =>
      ipcRenderer.invoke('market:install', type, id, name, version, pkg) as Promise<{ ok: boolean; dir?: string; error?: string }>,
    installGithubSkill: (sourceId: number, name: string, candidates: Array<{ owner: string; repo: string }>) =>
      ipcRenderer.invoke('market:installGithubSkill', sourceId, name, candidates) as Promise<{ ok: boolean; dir?: string; error?: string }>,
    uninstall: (type: MarketItemType, id: number | string) =>
      ipcRenderer.invoke('market:uninstall', type, id) as Promise<{ ok: boolean; error?: string }>,
    list: () => ipcRenderer.invoke('market:list') as Promise<InstalledRecord[]>,
    export: () => ipcRenderer.invoke('market:export') as Promise<{ ok: boolean; path?: string; error?: string }>,
    import: () => ipcRenderer.invoke('market:import') as Promise<{ ok: boolean; imported?: number; error?: string }>,
    detail: (type: MarketItemType, id: number | string) =>
      ipcRenderer.invoke('market:detail', type, id) as Promise<{ ok: boolean; detail?: MarketItemDetail; error?: string }>,
    importDir: (type: MarketItemType) =>
      ipcRenderer.invoke('market:importDir', type) as Promise<{ ok: boolean; record?: InstalledRecord; error?: string }>,
    register: (type: MarketItemType, id: number | string, name: string, version: string, dir: string) =>
      ipcRenderer.invoke('market:register', type, id, name, version, dir) as Promise<{ ok: boolean; error?: string }>,
    update: (type: MarketItemType, id: number, name: string, version: string, pkg: Record<string, unknown>) =>
      ipcRenderer.invoke('market:update', type, id, name, version, pkg) as Promise<{ ok: boolean; dir?: string; error?: string }>,
    syncChat: () => ipcRenderer.invoke('market:syncChat') as Promise<{ ok: boolean; added?: number; error?: string }>
  },
  openclawMcp: {
    /** 从后端同步启用中的 MCP 到 OpenClaw 本地配置（登录后调用） */
    syncFromBackend: (token: string) =>
      ipcRenderer.invoke('mcp:syncFromBackend', token) as Promise<{ ok: boolean; count?: number; error?: string }>,
  },
  llmIntegrations: {
    list: () => ipcRenderer.invoke('llm-integrations:list') as Promise<LlmIntegration[]>,
    save: (integration: LlmIntegration) =>
      ipcRenderer.invoke('llm-integrations:save', integration) as Promise<{ ok: boolean; integrations: LlmIntegration[]; error?: string }>,
    remove: (id: string) =>
      ipcRenderer.invoke('llm-integrations:remove', id) as Promise<{ ok: boolean; integrations: LlmIntegration[]; error?: string }>,
    test: (baseUrl: string, apiKey: string, model: string) =>
      ipcRenderer.invoke('llm-integrations:test', { baseUrl, apiKey, model }) as Promise<{ ok: boolean; message?: string }>,
  },
  openclawChat: {
    /** 注入用户 llm-proxy 静态 Key（登录后调用；OpenClaw openai provider 指向云端 llm-proxy） */
    setProxyKey: (key: string) => {
      ipcRenderer.send('openclaw-chat:set-proxy-key', key)
    },
    send: (text: string, token: string, history?: OpenClawChatMessage[], knowledgeBaseId?: number, sessionId?: number, modelId?: string) =>
      ipcRenderer.invoke('openclaw-chat:send', { text, token, history, knowledgeBaseId, sessionId, modelId }) as Promise<{ ok: boolean; aborted?: boolean }>,
    abort: () => {
      ipcRenderer.send('openclaw-chat:abort')
    },
    onMessage: (callback: (payload: OpenClawChatMessagePayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatMessagePayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:message', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:message', handler)
      }
    },
    /** 终审/来源标注后的最终文本（openclaw-chat:finalize；渲染层用其覆盖流式内容） */
    onFinalize: (callback: (payload: OpenClawChatMessagePayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatMessagePayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:finalize', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:finalize', handler)
      }
    },
    onToolCall: (callback: (toolCall: OpenClawToolCall) => void) => {
      const handler = (_event: IpcRendererEvent, toolCall: OpenClawToolCall): void => callback(toolCall)
      ipcRenderer.on('openclaw-chat:tool-call', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:tool-call', handler)
      }
    },
    /** Agent 生命周期（openclaw-chat:lifecycle）：start → finishing → end/error */
    onLifecycle: (callback: (payload: OpenClawChatLifecyclePayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatLifecyclePayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:lifecycle', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:lifecycle', handler)
      }
    },
    onDone: (callback: (payload: OpenClawChatDonePayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatDonePayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:done', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:done', handler)
      }
    },
    onError: (callback: (payload: OpenClawChatErrorPayload) => void) => {
      const handler = (_event: IpcRendererEvent, payload: OpenClawChatErrorPayload): void => callback(payload)
      ipcRenderer.on('openclaw-chat:error', handler)
      return () => {
        ipcRenderer.removeListener('openclaw-chat:error', handler)
      }
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

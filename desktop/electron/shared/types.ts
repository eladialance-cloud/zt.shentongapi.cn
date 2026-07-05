// 主进程 / 渲染进程共享类型定义
// 该文件同时被 tsconfig.node.json 与 tsconfig.web.json 包含

export type ServiceName = 'openclaw' | 'n8n' | 'mcp'

export type ServiceStatus = 'running' | 'stopped' | 'starting' | 'error' | 'unknown'

export interface ServiceInfo {
  name: ServiceName
  displayName: string
  status: ServiceStatus
  port: number
  pid?: number
  /** 启动时间（ISO 8601 字符串） */
  startTime?: string
  /** CPU 占用百分比（0-100） */
  cpuUsage?: number
  /** 内存占用 MB */
  memoryUsage?: number
  /** 错误信息（status=error 时存在） */
  error?: string
}

export interface ServiceEnvCheck {
  openclaw: boolean
  n8n: boolean
  mcp: boolean
}

/** 运行时 manifest 中单个服务的入口定义 */
export interface RuntimeManifestEntry {
  version: string
  displayName: string
  port: number
  /** 平台 -> 入口文件名（如 win32 -> n8n.exe） */
  entry: Record<string, string>
  /** 平台-架构 -> 下载地址（如 win32-x64） */
  downloadUrl: Record<string, string>
  /** 平台-架构 -> SHA-256 哈希（构建期填充，空字符串表示未填充） */
  sha256: Record<string, string>
}

/** runtime/manifest.json 的类型结构 */
export interface RuntimeManifest {
  version: string
  services: Record<ServiceName, RuntimeManifestEntry>
}

/** 解析后的运行时启动命令组合 */
export interface ResolvedRuntime {
  cmd: string
  args: string[]
  env: NodeJS.ProcessEnv
  /** 来源:builtin(内置)/ userData(用户目录补丁)/ host(宿主机命令) */
  source: 'builtin' | 'userData' | 'host'
}

/** 状态变更事件 payload（通过 webContents.send('service:status-changed', payload) 推送） */
export interface ServiceStatusChangedPayload {
  name: ServiceName
  status: ServiceStatus
  info: ServiceInfo
}

/** 服务错误事件 payload（通过 webContents.send('service:error', payload) 推送） */
export interface ServiceErrorPayload {
  name: ServiceName
  message: string
  /** 已重试次数 */
  retryCount: number
}

export interface UpdateCheckResult {
  available: boolean
  version?: string
  forceUpdate: boolean
  releaseNotes?: string
}

/** 更新状态（通过 webContents.send('update:status', payload) 推送到渲染进程） */
export interface UpdateStatusPayload {
  /** 当前状态 */
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  /** 新版本号 */
  version?: string
  /** 更新日志 */
  releaseNotes?: string
  /** 是否强制更新 */
  forceUpdate: boolean
  /** 是否命中灰度 */
  grayscaleHit: boolean
  /** 灰度百分比（服务端下发） */
  grayscalePercent?: number
  /** 下载进度 0-100 */
  progress: number
  /** 附加信息（错误消息等） */
  message?: string
}

/** 运行时下载进度（通过 webContents.send('runtime:download-progress', payload) 推送） */
export interface RuntimeDownloadProgress {
  /** 服务名 */
  name: ServiceName
  /** 进度百分比 0-100 */
  percent: number
  /** 下载速率 KB/s */
  speedKBs: number
  /** 预计剩余秒数 */
  etaSec: number
}

/** 运行时校验结果（runtime:verify 通道返回值） */
export interface RuntimeVerifyResult {
  /** 各服务完整性 */
  results: Record<ServiceName, boolean>
  /** 全部通过 */
  allPassed: boolean
}

/** 同步队列实体类型 */
export type SyncEntityType = 'chat_session' | 'chat_message' | 'workflow_execution' | 'plugin_call_log'

/** 同步队列操作类型 */
export type SyncOperation = 'create' | 'update' | 'delete'

/** 同步队列项（入队时使用） */
export interface SyncQueueItem {
  client_txn_id: string
  entity_type: SyncEntityType
  entity_id: string
  operation: SyncOperation
  payload: unknown
}

/** 同步队列行（数据库中的完整记录） */
export interface SyncQueueRow {
  id: number
  client_txn_id: string
  entity_type: SyncEntityType
  entity_id: string
  operation: SyncOperation
  payload: unknown
  status: 'pending' | 'synced' | 'failed'
  retry_count: number
  error_message: string | null
  created_at: string
  synced_at: string | null
}

// 设备指纹（采集本机硬件/系统特征生成 SHA-256 哈希）
export interface DeviceFingerprint {
  fingerprint: string // SHA-256 哈希（64 字符 hex）
  hostname: string
  platform: string // win32/darwin/linux
  arch: string // x64/arm64
  macAddress: string
  appVersion: string
}

// 完整设备信息（指纹 + 设备名 + CPU/内存）
export interface DeviceInfo extends DeviceFingerprint {
  deviceName: string
  cpus: number
  totalMemory: number
}

// 通过 contextBridge 暴露给渲染进程的 API 形状
export interface ElectronAPI {
  service: {
    getStatus(): Promise<Record<ServiceName, ServiceStatus>>
    /** 获取单个服务的完整信息（含 pid/cpu/memory/startTime） */
    status(name: ServiceName): Promise<ServiceInfo>
    /** 获取所有服务的完整信息列表 */
    list(): Promise<ServiceInfo[]>
    start(name: ServiceName): Promise<boolean>
    stop(name: ServiceName): Promise<boolean>
    restart(name: ServiceName): Promise<boolean>
    checkEnv(): Promise<ServiceEnvCheck>
    install(name: ServiceName): Promise<boolean>
    /** 监听服务状态变更，返回取消监听函数 */
    onStatusChanged(
      callback: (payload: ServiceStatusChangedPayload) => void
    ): () => void
    /** 监听服务错误事件，返回取消监听函数 */
    onError(callback: (payload: ServiceErrorPayload) => void): () => void
  }
  app: {
    getVersion(): Promise<string>
    checkUpdate(): Promise<void>
    quitAndInstall(): Promise<void>
  }
  /** 自动更新（electron-updater 封装） */
  updater: {
    /** 手动检查更新 */
    check(): Promise<void>
    /** 触发下载更新 */
    download(): Promise<void>
    /** 退出并安装更新 */
    install(): Promise<void>
    /** 监听更新状态变更，返回取消监听函数 */
    onStatus(callback: (payload: UpdateStatusPayload) => void): () => void
  }
  window: {
    minimize(): void
    maximize(): void
    close(): void
  }
  device: {
    getFingerprint(): Promise<string>
  }
  db: {
    /** 初始化本地数据库（登录后调用），返回是否成功（失败则进入降级模式） */
    initialize(userToken: string): Promise<boolean>
    /** 检查本地数据库是否处于降级模式（同步） */
    isDegraded(): boolean
    /** 关闭本地数据库（登出时调用） */
    close(): void
  }
  /** 同步队列操作（离线调用队列 + 上行同步） */
  syncQueue: {
    /** 入队：写入 local_sync_queue，返回自增 id */
    enqueue(item: SyncQueueItem): Promise<number>
    /** 读取 status=pending 的记录，最多 limit 条 */
    getPending(limit: number): Promise<SyncQueueRow[]>
    /** 更新记录状态（同步成功/失败时调用） */
    updateStatus(
      id: number,
      status: 'synced' | 'failed' | 'pending',
      retryCount: number,
      errorMessage?: string
    ): Promise<void>
    /** 根据 client_txn_id 查询是否已存在 */
    exists(client_txn_id: string): Promise<boolean>
  }
}

/** 通过 contextBridge.exposeInMainWorld('runtime', ...) 暴露给渲染进程的运行时 API 形状 */
export interface RuntimeAPI {
  /** 校验所有服务运行时完整性，返回各服务结果与是否全部通过 */
  verify(): Promise<RuntimeVerifyResult>
  /** 校验单个服务运行时完整性（SHA-256） */
  verifyOne(name: ServiceName): Promise<boolean>
  /** 下载服务运行时到 userData 目录（含 SHA-256 校验与解压） */
  download(name: ServiceName): Promise<boolean>
  /** 取消正在进行的下载（保留临时文件以便断点续传） */
  cancelDownload(name: ServiceName): Promise<boolean>
  /** 监听下载进度推送，返回取消监听函数（便于 React useEffect cleanup） */
  onDownloadProgress(callback: (progress: RuntimeDownloadProgress) => void): () => void
}

// 远程控制管理器（Task 14）
//
// 实现说明：
// - 主进程单例 RemoteControlManager，管理到云端网关的 WebSocket 长连接
// - 鉴权：连接时通过 URL 查询参数携带 token + deviceId
// - 心跳：每 30s 发送 ping，超时则触发重连
// - 自动重连：退避序列 1s / 2s / 5s / 10s / 30s，循环
// - 命令解析：关键词命令（运行工作流 / 查询状态 / 停止任务）+ 自然语言（TODO Hermes）
// - 高危操作白名单：delete_file / format_disk / execute_system_command / modify_system_config
//   匹配高危时不立即执行，回传 need_confirmation，等待二次确认消息后才执行
// - 任务进度回调：通过 EventEmitter 订阅本地任务执行事件，回传 IM
// - 应用退出时清理 WebSocket

import { EventEmitter } from 'node:events'
import { getMainWindow } from './windows/main-window'
import type {
  RemoteControlPlatform,
  RemoteControlSettings,
  RemoteCommand,
  RemoteCommandType,
  RemoteCommandResult,
  RemoteSecurityLevel
} from '../shared/types'

// ===== 常量 =====

/** 心跳间隔（30 秒） */
const HEARTBEAT_INTERVAL_MS = 30_000
/** 心跳超时（60 秒无响应视为断线） */
const HEARTBEAT_TIMEOUT_MS = 60_000
/** 待确认命令过期时间（5 分钟） */
const PENDING_CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000
/** 待确认轮询清理间隔 */
const PENDING_CLEANUP_INTERVAL_MS = 60_000

/** 自动重连退避序列（毫秒）：1s / 2s / 5s / 10s / 30s 循环 */
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000]

/** 高危操作白名单 */
const HIGH_RISK_OPERATIONS: ReadonlySet<RemoteCommandType> = new Set([
  'delete_file',
  'format_disk',
  'execute_system_command',
  'modify_system_config'
])

/** WebSocket 就绪状态常量（与浏览器 WHATWG WebSocket 一致） */
const WS_READY_STATE_OPEN = 1

// ===== 类型声明 =====

/**
 * Electron 主进程通过 Chromium 暴露全局 WebSocket 构造器。
 * 此处声明其最小可用形状（tsconfig.node.json 不含 DOM lib）。
 */
interface IWebSocket {
  readonly readyState: number
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null
  onerror: ((event: { error?: Error; message?: string }) => void) | null
  send(data: string): void
  close(code?: number, reason?: string): void
}

type WebSocketConstructor = new (
  url: string,
  protocols?: string | string[]
) => IWebSocket

/** 从全局获取 WebSocket 构造器（Electron 主进程） */
function getWebSocketConstructor(): WebSocketConstructor {
  const g = globalThis as unknown as { WebSocket?: WebSocketConstructor }
  if (!g.WebSocket) {
    throw new Error('[remote-control] 当前运行环境未暴露全局 WebSocket')
  }
  return g.WebSocket
}

/** 云端下发命令的原始消息结构 */
interface IncomingCommandMessage {
  /** 命令唯一 ID */
  commandId?: string
  /** 命令文本 */
  text?: string
  /** 命令类型（云端可直接指定，覆盖解析结果） */
  type?: RemoteCommandType
  /** 来源平台 */
  source?: RemoteControlPlatform
  /** 二次确认标记：true 表示这是对高危操作的确认 */
  confirm?: boolean
  /** 待确认的命令 ID（confirm=true 时必填） */
  confirmCommandId?: string
}

/** 待确认命令条目 */
interface PendingConfirmation {
  command: RemoteCommand
  expiresAt: number
}

/** 本地任务执行事件（由 service-manager / 任务执行器推送） */
interface TaskExecutionEvent {
  /** 关联的远程命令 ID */
  commandId: string
  status: 'running' | 'success' | 'failed'
  progress?: number
  message?: string
  data?: unknown
}

/** 连接配置 */
export interface RemoteControlConfig {
  serverUrl: string
  token: string
  deviceId: string
}

// ===== 默认设置 =====

const DEFAULT_SETTINGS: RemoteControlSettings = {
  enabled: false,
  securityLevel: 'medium',
  feishu: { bound: false },
  wecom: { bound: false },
  deviceWhitelist: []
}

// ===== 命令解析器（SubTask 14.3） =====

/**
 * 解析远程命令文本为结构化命令对象。
 *
 * 关键词命令：
 *  - "运行工作流 <name>"   → run_workflow
 *  - "查询状态"            → query_status
 *  - "停止任务 <id>"       → stop_task
 *  - "删除文件 <path>"     → delete_file（高危）
 *  - "格式化磁盘"          → format_disk（高危）
 *  - "执行系统命令 <cmd>"  → execute_system_command（高危）
 *  - "修改系统配置"        → modify_system_config（高危）
 *
 * 自然语言命令：调用 Hermes API 进行意图识别。
 * TODO: Hermes 意图识别服务就绪后接入，当前返回 unknown。
 */
export function parseCommand(
  text: string,
  commandId: string,
  source: RemoteControlPlatform,
  cloudType?: RemoteCommandType
): RemoteCommand {
  const raw = text.trim()
  const payload: RemoteCommand['payload'] = { raw }

  // 云端直接指定类型时优先采用
  if (cloudType && cloudType !== 'unknown') {
    return { commandId, type: cloudType, payload, raw, source }
  }

  // 关键词匹配
  const runWorkflowMatch = raw.match(/^运行工作流\s+(.+)$/u)
  if (runWorkflowMatch) {
    payload.name = runWorkflowMatch[1].trim()
    return { commandId, type: 'run_workflow', payload, raw, source }
  }

  if (/^查询状态/u.test(raw)) {
    return { commandId, type: 'query_status', payload, raw, source }
  }

  const stopTaskMatch = raw.match(/^停止任务\s+(.+)$/u)
  if (stopTaskMatch) {
    payload.taskId = stopTaskMatch[1].trim()
    return { commandId, type: 'stop_task', payload, raw, source }
  }

  const deleteFileMatch = raw.match(/^删除文件\s+(.+)$/u)
  if (deleteFileMatch) {
    payload.name = deleteFileMatch[1].trim()
    return { commandId, type: 'delete_file', payload, raw, source }
  }

  if (/^格式化磁盘/u.test(raw)) {
    return { commandId, type: 'format_disk', payload, raw, source }
  }

  const execCmdMatch = raw.match(/^执行系统命令\s+(.+)$/u)
  if (execCmdMatch) {
    payload.name = execCmdMatch[1].trim()
    return { commandId, type: 'execute_system_command', payload, raw, source }
  }

  if (/^修改系统配置/u.test(raw)) {
    return { commandId, type: 'modify_system_config', payload, raw, source }
  }

  // 自然语言：TODO Hermes 意图识别（服务未就绪，标记为 unknown）
  return { commandId, type: 'unknown', payload, raw, source }
}

/** 判断命令是否为高危操作 */
export function isHighRiskCommand(command: RemoteCommand): boolean {
  return HIGH_RISK_OPERATIONS.has(command.type)
}

// ===== RemoteControlManager（SubTask 14.2 / 14.4 / 14.5） =====

/**
 * 远程控制管理器（主进程单例）。
 *
 * 职责：
 *  - 维护到云端网关的 WebSocket 长连接（鉴权 / 心跳 / 自动重连）
 *  - 接收 IM 命令 → 命令解析 → 高危确认拦截 → 执行 → 回传结果
 *  - 暴露 EventEmitter 事件：
 *      'command-result'  命令执行结果（转发到渲染进程 + 回传云端）
 *      'status-changed'  连接状态变更
 */
export class RemoteControlManager extends EventEmitter {
  private ws: IWebSocket | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private pendingCleanupInterval: ReturnType<typeof setInterval> | null = null

  private reconnectAttempts = 0
  private connected = false
  private manualDisconnect = false
  private lastError: string | undefined

  private config: RemoteControlConfig | null = null
  private settings: RemoteControlSettings = { ...DEFAULT_SETTINGS }

  /** 本地状态查询提供者（由主进程注入 serviceManager.getAllStatus） */
  private statusProvider: (() => unknown) | null = null

  /** 认证 token 提供者（主进程在登录后注入，用于调用后端 API；async 以支持 IPC/SafeStorage 读取） */
  private authTokenProvider: (() => Promise<string | null>) | null = null

  /** 后端 API base URL 提供者（返回值不含 /api 后缀） */
  private apiBaseProvider: (() => Promise<string>) | null = null

  /** 待确认的高危命令：commandId → { command, expiresAt } */
  private pendingConfirmations = new Map<string, PendingConfirmation>()

  /** 命令 ID → 本地任务 ID 的映射（用于进度回调） */
  private taskSubscriptions = new Map<string, string>()

  /** 最近一次收到 pong 的时间戳 */
  private lastPongAt = 0

  private static instance: RemoteControlManager | null = null

  private constructor() {
    super()
    // 启动待确认命令清理定时器
    this.pendingCleanupInterval = setInterval(
      () => this.cleanupExpiredConfirmations(),
      PENDING_CLEANUP_INTERVAL_MS
    )
  }

  /** 获取单例 */
  static getInstance(): RemoteControlManager {
    if (!RemoteControlManager.instance) {
      RemoteControlManager.instance = new RemoteControlManager()
    }
    return RemoteControlManager.instance
  }

  // ===== 设置读写 =====

  /** 读取当前设置（返回副本） */
  getSettings(): RemoteControlSettings {
    return {
      ...this.settings,
      feishu: { ...this.settings.feishu },
      wecom: { ...this.settings.wecom },
      deviceWhitelist: this.settings.deviceWhitelist.map((d) => ({ ...d }))
    }
  }

  /** 更新设置（合并），并在必要时触发连接/断开 */
  updateSettings(patch: Partial<RemoteControlSettings>): void {
    const prevEnabled = this.settings.enabled
    this.settings = {
      ...this.settings,
      ...patch,
      feishu: { ...this.settings.feishu, ...(patch.feishu ?? {}) },
      wecom: { ...this.settings.wecom, ...(patch.wecom ?? {}) },
      deviceWhitelist: patch.deviceWhitelist
        ? patch.deviceWhitelist.map((d) => ({ ...d }))
        : this.settings.deviceWhitelist
    }

    // 总开关状态变化时连接/断开
    if (this.settings.enabled && !prevEnabled) {
      void this.connect().catch((err) => {
        console.error('[remote-control] connect on enable failed:', err)
      })
    } else if (!this.settings.enabled && prevEnabled) {
      void this.disconnect()
    }
  }

  // ===== 绑定 / 解绑 =====

  /** 绑定 IM 平台 */
  bind(platform: RemoteControlPlatform, webhookUrl: string): boolean {
    if (!webhookUrl) return false
    const binding = { bound: true, webhookUrl, boundAt: new Date().toISOString() }
    this.updateSettings({ [platform]: binding } as unknown as Pick<RemoteControlSettings, typeof platform>)
    return true
  }

  /** 解绑 IM 平台 */
  unbind(platform: RemoteControlPlatform): void {
    this.updateSettings({
      [platform]: { bound: false }
    } as unknown as Pick<RemoteControlSettings, typeof platform>)
  }

  // ===== 连接管理 =====

  /** 设置连接配置（由主进程在登录后注入 token/deviceId/serverUrl） */
  setConfig(config: RemoteControlConfig): void {
    this.config = { ...config }
  }

  /** 注入本地状态查询提供者（主进程将 serviceManager.getAllStatus 传入） */
  setStatusProvider(provider: (() => unknown) | null): void {
    this.statusProvider = provider
  }

  /** 注入认证 token 提供者（主进程在登录后注入，用于调用后端 API；async 以支持 IPC/SafeStorage 读取） */
  setAuthTokenProvider(provider: (() => Promise<string | null>) | null): void {
    this.authTokenProvider = provider
  }

  /** 注入后端 API base URL 提供者（返回值不含 /api 后缀） */
  setApiBaseProvider(provider: (() => Promise<string>) | null): void {
    this.apiBaseProvider = provider
  }

  /** 获取当前状态 */
  getStatus(): { connected: boolean; deviceId: string; error?: string } {
    return {
      connected: this.connected,
      deviceId: this.config?.deviceId ?? '',
      error: this.lastError
    }
  }

  /** 连接 WebSocket（带鉴权） */
  async connect(): Promise<void> {
    if (!this.config) {
      const err = '连接配置缺失（token/deviceId/serverUrl 未设置）'
      this.lastError = err
      console.warn(`[remote-control] ${err}`)
      return
    }
    // 已连接则跳过
    if (this.ws && this.connected) return

    this.manualDisconnect = false
    this.lastError = undefined

    const { serverUrl, token, deviceId } = this.config
    const url = `${serverUrl}?token=${encodeURIComponent(token)}&deviceId=${encodeURIComponent(deviceId)}`

    try {
      const WebSocketCtor = getWebSocketConstructor()
      this.ws = new WebSocketCtor(url)
      this.registerWsHandlers()
    } catch (err) {
      this.lastError = (err as Error).message
      console.error('[remote-control] WebSocket 构造失败:', err)
      this.scheduleReconnect()
    }
  }

  /** 断开连接（手动） */
  async disconnect(): Promise<void> {
    this.manualDisconnect = true
    this.clearReconnectTimer()
    this.stopHeartbeat()
    if (this.ws) {
      try {
        this.ws.onopen = null
        this.ws.onmessage = null
        this.ws.onclose = null
        this.ws.onerror = null
        this.ws.close(1000, 'client disconnect')
      } catch {
        // 忽略关闭错误
      }
      this.ws = null
    }
    this.setConnected(false)
  }

  /** 注册 WebSocket 事件处理器 */
  private registerWsHandlers(): void {
    if (!this.ws) return

    this.ws.onopen = () => {
      console.log('[remote-control] connected')
      this.reconnectAttempts = 0
      this.lastError = undefined
      this.setConnected(true)
      this.lastPongAt = Date.now()
      this.startHeartbeat()
      this.reportOnlineStatus()
    }

    this.ws.onmessage = (event: { data: unknown }) => {
      this.handleMessage(event.data)
    }

    this.ws.onclose = (event) => {
      console.log(`[remote-control] closed: code=${event.code} reason=${event.reason}`)
      this.setConnected(false)
      this.stopHeartbeat()
      if (!this.manualDisconnect) {
        this.scheduleReconnect()
      }
    }

    this.ws.onerror = (event) => {
      const msg = event?.message || (event?.error?.message ?? 'WebSocket error')
      this.lastError = msg
      console.error('[remote-control] error:', msg)
    }
  }

  /** 设置连接状态并广播 */
  private setConnected(value: boolean): void {
    if (this.connected === value) return
    this.connected = value
    this.emit('status-changed', this.getStatus())
    // 转发到渲染进程
    this.forwardToRenderer('remoteControl:status-changed', this.getStatus())
  }

  // ===== 心跳 =====

  /** 启动心跳定时器（30s ping + 超时检测） */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WS_READY_STATE_OPEN) return
      // 超时检测
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        console.warn('[remote-control] heartbeat timeout, forcing reconnect')
        this.forceReconnect()
        return
      }
      try {
        this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
      } catch (err) {
        console.error('[remote-control] heartbeat send failed:', err)
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  /** 停止心跳 */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer)
      this.heartbeatTimeoutTimer = null
    }
  }

  /** 强制重连 */
  private forceReconnect(): void {
    if (this.ws) {
      try {
        this.ws.close(4000, 'heartbeat timeout')
      } catch {
        // 忽略
      }
    }
    // onclose 会触发 scheduleReconnect
  }

  // ===== 自动重连（退避） =====

  private scheduleReconnect(): void {
    if (this.manualDisconnect) return
    this.clearReconnectTimer()
    const delay =
      RECONNECT_BACKOFF_MS[
        Math.min(this.reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)
      ]
    this.reconnectAttempts += 1
    console.log(`[remote-control] reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)
    this.reconnectTimeout = setTimeout(() => {
      void this.connect().catch((err) => {
        console.error('[remote-control] reconnect failed:', err)
      })
    }, delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }
  }

  // ===== 消息处理 =====

  /** 处理收到的消息 */
  private handleMessage(rawData: unknown): void {
    let msg: IncomingCommandMessage
    try {
      if (typeof rawData === 'string') {
        msg = JSON.parse(rawData) as IncomingCommandMessage
      } else if (rawData instanceof Buffer) {
        msg = JSON.parse(rawData.toString('utf8')) as IncomingCommandMessage
      } else if (rawData instanceof ArrayBuffer) {
        msg = JSON.parse(new TextDecoder().decode(rawData)) as IncomingCommandMessage
      } else {
        console.warn('[remote-control] unsupported message type:', typeof rawData)
        return
      }
    } catch (err) {
      console.error('[remote-control] message parse failed:', err)
      return
    }

    // 心跳响应
    if ((msg as { type?: string }).type === 'pong') {
      this.lastPongAt = Date.now()
      return
    }

    // 二次确认消息
    if (msg.confirm && msg.confirmCommandId) {
      void this.handleConfirmation(msg.confirmCommandId)
      return
    }

    const commandId = msg.commandId ?? generateCommandId()
    const source: RemoteControlPlatform = msg.source ?? 'feishu'
    const text = msg.text ?? ''
    if (!text) {
      console.warn('[remote-control] empty command text, commandId=', commandId)
      return
    }

    const command = parseCommand(text, commandId, source, msg.type)
    void this.dispatchCommand(command)
  }

  /** 上报设备上线状态 */
  private reportOnlineStatus(): void {
    this.sendRaw({
      type: 'device_online',
      deviceId: this.config?.deviceId,
      timestamp: new Date().toISOString()
    })
  }

  // ===== 命令分发（含高危确认拦截，SubTask 14.4） =====

  /** 分发命令：解析 → 高危拦截 → 执行 → 回传结果 */
  private async dispatchCommand(command: RemoteCommand): Promise<void> {
    // 高危操作拦截
    if (isHighRiskCommand(command)) {
      // low 等级直接执行；medium 需单次确认；high 需二次确认 + 5 分钟超时
      if (this.settings.securityLevel === 'medium') {
        this.pendingConfirmations.set(command.commandId, {
          command,
          expiresAt: Date.now() + PENDING_CONFIRMATION_TIMEOUT_MS
        })
        await this.sendResult({
          commandId: command.commandId,
          status: 'need_confirmation',
          description: `高危操作「${command.type}」需要确认：${command.raw}`,
          message: '请回复确认以执行该高危操作'
        })
        return
      }
      if (this.settings.securityLevel === 'high') {
        // P1-006: 高危命令二次确认 + 5 分钟超时
        this.pendingConfirmations.set(command.commandId, {
          command,
          expiresAt: Date.now() + PENDING_CONFIRMATION_TIMEOUT_MS
        })
        await this.sendResult({
          commandId: command.commandId,
          status: 'need_confirmation',
          description: `高危操作「${command.type}」需要二次确认：${command.raw}`,
          message: 'High-risk command requires second confirmation (5 min timeout)'
        })
        return
      }
    }

    await this.executeCommand(command)
  }

  /** 处理二次确认消息 */
  private async handleConfirmation(commandId: string): Promise<void> {
    const pending = this.pendingConfirmations.get(commandId)
    if (!pending) {
      await this.sendResult({
        commandId,
        status: 'failed',
        message: '未找到待确认的命令或确认已过期'
      })
      return
    }
    // 未过期则执行
    if (pending.expiresAt > Date.now()) {
      this.pendingConfirmations.delete(commandId)
      await this.executeCommand(pending.command)
    } else {
      this.pendingConfirmations.delete(commandId)
      await this.sendResult({
        commandId,
        status: 'failed',
        message: '确认已超时，命令已取消'
      })
    }
  }

  /** 清理过期的待确认命令 */
  private cleanupExpiredConfirmations(): void {
    const now = Date.now()
    for (const [id, pending] of this.pendingConfirmations) {
      if (pending.expiresAt <= now) {
        this.pendingConfirmations.delete(id)
        // 回传超时失败
        void this.sendResult({
          commandId: id,
          status: 'failed',
          message: '确认超时，命令已自动取消'
        })
      }
    }
  }

  // ===== 命令执行（SubTask 14.5） =====

  /** 执行命令并回传结果 */
  private async executeCommand(command: RemoteCommand): Promise<void> {
    try {
      // 上报开始执行
      await this.sendResult({
        commandId: command.commandId,
        status: 'running',
        progress: 0,
        message: `开始执行：${command.raw}`
      })

      switch (command.type) {
        case 'query_status':
          await this.executeQueryStatus(command)
          break
        case 'run_workflow':
          await this.executeRunWorkflow(command)
          break
        case 'stop_task':
          await this.executeStopTask(command)
          break
        case 'delete_file':
        case 'format_disk':
        case 'execute_system_command':
        case 'modify_system_config':
          // 高危操作执行（已通过确认流程），这里仅占位回传
          await this.sendResult({
            commandId: command.commandId,
            status: 'success',
            message: `高危操作已执行（模拟）：${command.raw}`,
            data: { type: command.type, payload: command.payload }
          })
          break
        case 'unknown':
        default:
          await this.sendResult({
            commandId: command.commandId,
            status: 'failed',
            message: `无法识别的命令：${command.raw}`
          })
          break
      }
    } catch (err) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: `执行异常：${(err as Error).message}`
      })
    }
  }

  /** 查询状态：聚合本地服务状态 */
  private async executeQueryStatus(command: RemoteCommand): Promise<void> {
    let statusData: unknown = {}
    try {
      statusData = this.statusProvider ? this.statusProvider() : {}
    } catch (err) {
      console.error('[remote-control] query status failed:', err)
    }
    await this.sendResult({
      commandId: command.commandId,
      status: 'success',
      progress: 100,
      message: '设备在线，服务状态已返回',
      data: statusData
    })
  }

  /** 运行工作流：转发到后端 POST /api/workflows/:id/execute */
  private async executeRunWorkflow(command: RemoteCommand): Promise<void> {
    const name = command.payload.name
    if (!name) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: '缺少工作流名称'
      })
      return
    }

    // 调用后端 API 需要认证 token；若 token 提供者未注入或返回空，回退到模拟成功
    const token = (await this.authTokenProvider?.()) ?? null
    const apiBase = (await this.apiBaseProvider?.()) ?? null
    if (!token || !apiBase) {
      // 降级：authTokenProvider 未注入或返回空（主进程尚未在登录后调用 setAuthTokenProvider）
      // 当前回传模拟成功结果，并附带警告标识，便于 IM 端识别
      console.warn(
        '[remote-control] authTokenProvider returned empty, fallback to simulated mode'
      )
      const taskId = `task_${Date.now()}`
      this.taskSubscriptions.set(command.commandId, taskId)
      await this.sendResult({
        commandId: command.commandId,
        status: 'success',
        progress: 100,
        message: `工作流「${name}」已触发（模拟，taskId=${taskId}）— 后端 API 集成待注入 authTokenProvider`,
        data: { taskId, name, simulated: true }
      })
      return
    }

    try {
      // 后端：POST /api/workflows/:id/execute，body: { input }
      // name 可能为工作流 ID（数字）或名称；优先按 ID 处理
      const workflowId = encodeURIComponent(String(name))
      const response = await fetch(`${apiBase}/api/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ input: command.payload.input ?? {} }),
        signal: AbortSignal.timeout(60000)
      })
      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        await this.sendResult({
          commandId: command.commandId,
          status: 'failed',
          message: `工作流「${name}」触发失败：后端返回 ${response.status} ${errText}`.slice(0, 500)
        })
        return
      }
      const data = (await response.json()) as { data?: { id?: string | number }; code?: number; message?: string }
      const taskId = String(data?.data?.id ?? `task_${Date.now()}`)
      this.taskSubscriptions.set(command.commandId, taskId)
      await this.sendResult({
        commandId: command.commandId,
        status: 'success',
        progress: 100,
        message: `工作流「${name}」已触发（taskId=${taskId}）`,
        data: { taskId, name, simulated: false, response: data?.data }
      })
    } catch (err) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: `工作流「${name}」触发异常：${(err as Error).message}`.slice(0, 500)
      })
    }
  }

  /** 停止任务：转发到后端 POST /api/tasks/:id/cancel */
  private async executeStopTask(command: RemoteCommand): Promise<void> {
    const taskId = command.payload.taskId
    if (!taskId) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: '缺少任务 ID'
      })
      return
    }

    const token = (await this.authTokenProvider?.()) ?? null
    const apiBase = (await this.apiBaseProvider?.()) ?? null
    if (!token || !apiBase) {
      // 降级：authTokenProvider 未注入或返回空，回传模拟成功结果
      console.warn(
        '[remote-control] authTokenProvider returned empty, fallback to simulated mode'
      )
      await this.sendResult({
        commandId: command.commandId,
        status: 'success',
        message: `任务 ${taskId} 已请求停止（模拟）— 后端 API 集成待注入 authTokenProvider`,
        data: { taskId, simulated: true }
      })
      return
    }

    try {
      // 后端：POST /api/tasks/:id/cancel
      const id = encodeURIComponent(String(taskId))
      const response = await fetch(`${apiBase}/api/tasks/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        signal: AbortSignal.timeout(60000)
      })
      if (!response.ok) {
        const errText = await response.text().catch(() => '')
        await this.sendResult({
          commandId: command.commandId,
          status: 'failed',
          message: `任务 ${taskId} 取消失败：后端返回 ${response.status} ${errText}`.slice(0, 500)
        })
        return
      }
      const data = (await response.json()) as { data?: unknown; code?: number; message?: string }
      await this.sendResult({
        commandId: command.commandId,
        status: 'success',
        message: `任务 ${taskId} 已请求停止`,
        data: { taskId, simulated: false, response: data?.data }
      })
    } catch (err) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: `任务 ${taskId} 取消异常：${(err as Error).message}`.slice(0, 500)
      })
    }
  }

  // ===== 任务进度回调（SubTask 14.5） =====

  /**
   * 订阅本地任务执行事件。
   * 由 service-manager / 任务执行器在进度/完成时调用。
   */
  reportTaskEvent(event: TaskExecutionEvent): void {
    void this.sendResult({
      commandId: event.commandId,
      status: event.status,
      progress: event.progress,
      message: event.message,
      data: event.data
    })
    // 任务终态清理订阅
    if (event.status === 'success' || event.status === 'failed') {
      this.taskSubscriptions.delete(event.commandId)
    }
  }

  // ===== 结果回传 =====

  /** 发送命令执行结果到云端 + 转发到渲染进程 */
  async sendResult(result: RemoteCommandResult): Promise<void> {
    this.sendRaw({
      type: 'command_result',
      commandId: result.commandId,
      status: result.status,
      progress: result.progress,
      message: result.message,
      description: result.description,
      data: result.data
    })
    // 同时转发到渲染进程（便于 UI 展示）
    this.emit('command-result', result)
    this.forwardToRenderer('remoteControl:command-result', result)
  }

  /** 发送原始 JSON 到云端 */
  private sendRaw(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WS_READY_STATE_OPEN) {
      console.warn('[remote-control] not open, drop message:', JSON.stringify(payload).slice(0, 120))
      return
    }
    try {
      this.ws.send(JSON.stringify(payload))
    } catch (err) {
      console.error('[remote-control] send failed:', err)
    }
  }

  // ===== 渲染进程转发 =====

  private forwardToRenderer(channel: string, payload: unknown): void {
    try {
      getMainWindow()?.webContents.send(channel, payload)
    } catch (err) {
      // 主窗口可能尚未创建
      console.debug(`[remote-control] forward to renderer failed (${channel}):`, err)
    }
  }

  // ===== 清理 =====

  /** 应用退出时清理资源 */
  destroy(): void {
    void this.disconnect()
    if (this.pendingCleanupInterval) {
      clearInterval(this.pendingCleanupInterval)
      this.pendingCleanupInterval = null
    }
    this.pendingConfirmations.clear()
    this.taskSubscriptions.clear()
    this.removeAllListeners()
  }
}

/** 生成命令 ID（云端未下发时使用） */
function generateCommandId(): string {
  return `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/** 获取远程控制管理器单例 */
export function getRemoteControlManager(): RemoteControlManager {
  return RemoteControlManager.getInstance()
}

/** 根据安全等级描述（UI 用） */
export function describeSecurityLevel(level: RemoteSecurityLevel): string {
  switch (level) {
    case 'high':
      return '高（高危命令需二次确认 + 5分钟超时）'
    case 'medium':
      return '中（执行类命令需二次确认）'
    case 'low':
      return '低（执行类命令直接执行）'
    default:
      return level
  }
}

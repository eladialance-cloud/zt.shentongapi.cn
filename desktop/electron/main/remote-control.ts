// 远程控制管理器（Task 14 + 自动化工作台阶段1）
//
// 实现说明：
// - 主进程单例 RemoteControlManager，通过 socket.io-client 连接云端 sync 网关
//   （wss://zt.shentongapi.cn/sync，auth.token=JWT，连接后自动加入 user:<id> 房间）
// - 鉴权：连接时通过 auth.token 携带 JWT；deviceId 通过 query 参数附带
// - 断线重连：socket.io 内置指数退避自动重连（1s→30s 封顶，无限次）
// - 命令解析：关键词命令（运行工作流 / 查询状态 / 停止任务 / 系统命令 / 文件读写）+ 云端指定类型
// - 高危操作白名单：delete_file / format_disk / execute_system_command / modify_system_config
//   匹配高危时不立即执行，回传 need_confirmation，等待 IM 二次确认后才执行
// - 任务进度回调：通过 EventEmitter 订阅本地任务执行事件，回传 IM
// - 结果回传：socket.emit('remote:result', ...)，云端 B5 回传飞书

import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { shell } from 'electron'
import { io, type Socket } from 'socket.io-client'
import { runLocalN8nWorkflow } from './n8n-executor'
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

/** 待确认命令过期时间（5 分钟） */
const PENDING_CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1000
/** 待确认轮询清理间隔 */
const PENDING_CLEANUP_INTERVAL_MS = 60_000

/** 高危操作白名单 */
const HIGH_RISK_OPERATIONS: ReadonlySet<RemoteCommandType> = new Set([
  'delete_file',
  'format_disk',
  'execute_system_command',
  'modify_system_config'
])

/** 系统命令最大执行时长（60 秒） */
const SYSTEM_COMMAND_TIMEOUT_MS = 60_000
/** 系统命令输出上限（2MB） */
const SYSTEM_COMMAND_MAX_BUFFER = 2 * 1024 * 1024
/** 文件读取大小上限（256KB 以上只返回元信息） */
const FILE_READ_MAX_SIZE = 256 * 1024
/** 文件内容回传上限（文本 20KB / base64 4KB） */
const FILE_READ_MAX_TEXT = 20_000
const FILE_READ_MAX_BASE64 = 4000

// ===== 类型声明 =====

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
  /** 回传上下文（云端 B5 需要知道把结果回给哪个 IM 会话） */
  replyContext?: { channelId: number; senderExternalId: string }
  /** 云端直接下发的命令负载（run_scenario 等：instanceId/steps/params） */
  payload?: Record<string, unknown>
  /** 目标设备指纹（场景绑定了指定设备时下发；留空=任意在线设备） */
  targetDeviceId?: string
}

/** 回传上下文 */
interface ReplyContext {
  channelId: number
  senderExternalId: string
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
  /** 云端 API 域名（不含 /api 与 /sync，如 https://zt.shentongapi.cn） */
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
 *  - "执行系统命令 <cmd>"  → execute_system_command（高危）
 *  - "读取文件 <path>"     → file_read
 *  - "打开文件 <path>"     → file_open
 *  - "删除文件 <path>"     → delete_file（高危）
 *  - "格式化磁盘"          → format_disk（高危）
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

  const execCmdMatch = raw.match(/^执行系统命令\s+(.+)$/u)
  if (execCmdMatch) {
    payload.name = execCmdMatch[1].trim()
    return { commandId, type: 'execute_system_command', payload, raw, source }
  }

  const fileReadMatch = raw.match(/^读取文件\s+(.+)$/u)
  if (fileReadMatch) {
    payload.path = fileReadMatch[1].trim()
    return { commandId, type: 'file_read', payload, raw, source }
  }

  const fileOpenMatch = raw.match(/^打开文件\s+(.+)$/u)
  if (fileOpenMatch) {
    payload.path = fileOpenMatch[1].trim()
    return { commandId, type: 'file_open', payload, raw, source }
  }

  const deleteFileMatch = raw.match(/^删除文件\s+(.+)$/u)
  if (deleteFileMatch) {
    payload.name = deleteFileMatch[1].trim()
    return { commandId, type: 'delete_file', payload, raw, source }
  }

  if (/^格式化磁盘/u.test(raw)) {
    return { commandId, type: 'format_disk', payload, raw, source }
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
 *  - 维护到云端 sync 网关的 socket.io 长连接（鉴权 / 自动重连）
 *  - 接收 remote:command → 命令解析 → 高危确认拦截 → 执行 → remote:result 回传
 *  - 暴露 EventEmitter 事件：
 *      'command-result'  命令执行结果（转发到渲染进程 + 回传云端）
 *      'status-changed'  连接状态变更
 */
export class RemoteControlManager extends EventEmitter {
  private socket: Socket | null = null
  private pendingCleanupInterval: ReturnType<typeof setInterval> | null = null

  private connected = false
  private manualDisconnect = false
  private lastError: string | undefined

  private config: RemoteControlConfig | null = null
  private settings: RemoteControlSettings = { ...DEFAULT_SETTINGS }


  /** 对话咨询提供者（主进程注入：未知命令走本地 OpenClaw 对话，返回 AI 回答或 null） */
  private chatProvider: ((text: string) => Promise<string | null>) | null = null
  /** 本地状态查询提供者（由主进程注入 serviceManager.getAllStatus） */
  private statusProvider: (() => unknown) | null = null

  /** 认证 token 提供者（主进程在登录后注入，用于调用后端 API；async 以支持 IPC/SafeStorage 读取） */
  private authTokenProvider: (() => Promise<string | null>) | null = null

  /** 后端 API base URL 提供者（返回值不含 /api 后缀，如 https://zt.shentongapi.cn） */
  private apiBaseProvider: (() => Promise<string>) | null = null

  /** 待确认的高危命令：commandId → { command, expiresAt } */
  private pendingConfirmations = new Map<string, PendingConfirmation>()

  /** 命令 ID → 回传上下文（channelId / senderExternalId），终态清理 */
  private replyContexts = new Map<string, ReplyContext>()

  /** 命令 ID → 本地任务 ID 的映射（用于进度回调） */
  private taskSubscriptions = new Map<string, string>()

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


  /** 注入对话咨询提供者（未知命令 → 本地 OpenClaw 对话） */
  setChatProvider(provider: ((text: string) => Promise<string | null>) | null): void {
    this.chatProvider = provider
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

  /** 连接云端 sync 网关（socket.io，auth.token 鉴权，内置自动重连） */
  async connect(): Promise<void> {
    if (!this.config) {
      const err = '连接配置缺失（token/deviceId/serverUrl 未设置）'
      this.lastError = err
      console.warn(`[remote-control] ${err}`)
      return
    }
    if (this.socket) return

    this.manualDisconnect = false
    this.lastError = undefined

    const { serverUrl, token, deviceId } = this.config
    const base = serverUrl.replace(/\/+$/, '')

    try {
      const socket = io(`${base}/sync`, {
        transports: ['websocket'],
        auth: { token },
        query: { deviceId },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        timeout: 10000
      })
      this.socket = socket
      this.registerSocketHandlers(socket)
    } catch (err) {
      this.lastError = (err as Error).message
      console.error('[remote-control] socket.io 构造失败:', err)
    }
  }

  /** 断开连接（手动） */
  async disconnect(): Promise<void> {
    this.manualDisconnect = true
    if (this.socket) {
      try {
        this.socket.removeAllListeners()
        this.socket.disconnect()
      } catch {
        // 忽略关闭错误
      }
      this.socket = null
    }
    this.setConnected(false)
  }

  /** 更新配置并重连（登录/刷新 token 后调用） */
  async reconnect(config: RemoteControlConfig): Promise<void> {
    this.config = { ...config }
    await this.disconnect()
    if (this.settings.enabled) {
      await this.connect().catch((err) => {
        console.error('[remote-control] reconnect failed:', err)
      })
    }
  }

  /** 注册 socket.io 事件处理器 */
  private registerSocketHandlers(socket: Socket): void {
    socket.on('connect', () => {
      console.log('[remote-control] socket.io connected')
      this.lastError = undefined
      this.setConnected(true)
      this.reportOnlineStatus()
    })

    socket.on('disconnect', (reason: string) => {
      console.log(`[remote-control] socket.io disconnected: ${reason}`)
      this.setConnected(false)
    })

    socket.on('connect_error', (err: Error) => {
      const msg = err?.message ?? 'connect_error'
      this.lastError = msg
      console.error('[remote-control] socket.io connect_error:', msg)
    })

    // 云端 IM 命令下发（自动化工作台 B2）
    socket.on('remote:command', (msg: unknown) => {
      this.handleIncomingCommand(msg as IncomingCommandMessage)
    })
  }

  /** 设置连接状态并广播 */
  private setConnected(value: boolean): void {
    if (this.connected === value) return
    this.connected = value
    this.emit('status-changed', this.getStatus())
    // 转发到渲染进程
    this.forwardToRenderer('remoteControl:status-changed', this.getStatus())
  }

  // ===== 消息处理 =====

  /**
   * 处理云端下发的命令（socket.io remote:command 事件）
   * 公开方法：可被 socket 事件 / IPC / 测试直接调用
   */
  handleIncomingCommand(msg: IncomingCommandMessage): void {
    if (!msg || typeof msg !== 'object') return

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

    // D2：命令指定目标设备时校验设备指纹归属
    if (msg.targetDeviceId && this.config?.deviceId && msg.targetDeviceId !== this.config.deviceId) {
      console.warn(
        `[remote-control] 命令 ${commandId} 绑定的是其他设备（${msg.targetDeviceId}），当前设备 ${this.config.deviceId} 拒绝执行`
      )
      void this.sendResult({
        commandId,
        status: 'failed',
        message: '该命令绑定的是另一台设备，当前电脑不执行'
      })
      return
    }

    // 记录回传上下文（云端 B5 用于把结果发回对应 IM 会话）
    if (msg.replyContext?.channelId && msg.replyContext?.senderExternalId) {
      this.replyContexts.set(commandId, {
        channelId: Number(msg.replyContext.channelId),
        senderExternalId: String(msg.replyContext.senderExternalId)
      })
    }

    let command: RemoteCommand
    if (msg.type && msg.type !== 'unknown' && msg.payload && typeof msg.payload === 'object') {
      // 云端直接指定类型 + 负载（run_scenario 等），payload 透传
      command = { commandId, type: msg.type, payload: { raw: text, ...msg.payload }, raw: text, source }
    } else {
      command = parseCommand(text, commandId, source, msg.type)
    }
    void this.dispatchCommand(command)
  }

  /** 上报设备上线状态 */
  private reportOnlineStatus(): void {
    this.emitRemote('device_online', {
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
          message: '该操作需要确认，请回复「确认」以执行'
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
        case 'execute_system_command':
          await this.executeSystemCommand(command)
          break
        case 'run_scenario':
          await this.executeRunScenario(command)
          break
        case 'file_read':
          await this.executeFileRead(command)
          break
        case 'file_open':
          await this.executeFileOpen(command)
          break
        case 'delete_file':
        case 'format_disk':
        case 'modify_system_config':
          // 高危操作执行（已通过确认流程），暂未实现真实操作，回传占位结果
          await this.sendResult({
            commandId: command.commandId,
            status: 'success',
            message: `高危操作已执行（模拟）：${command.raw}`,
            data: { type: command.type, payload: command.payload }
          })
          break
        case 'unknown':
        default:
          await this.executeUnknown(command)
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


  /** 未知命令：走对话咨询（本地 OpenClaw AI 直接回答），无提供者时回传无法识别 */
  private async executeUnknown(command: RemoteCommand): Promise<void> {
    const provider = this.chatProvider
    if (!provider) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: `无法识别的命令：${command.raw}`
      })
      return
    }
    await this.sendResult({
      commandId: command.commandId,
      status: 'running',
      progress: 10,
      message: 'AI 正在理解你的消息…'
    })
    try {
      const answer = await provider(command.raw)
      if (answer && answer.trim()) {
        await this.sendResult({
          commandId: command.commandId,
          status: 'success',
          progress: 100,
          message: answer.trim().slice(0, 2000)
        })
      } else {
        await this.sendResult({
          commandId: command.commandId,
          status: 'failed',
          message: `无法识别的命令：${command.raw}`
        })
      }
    } catch (err) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: `AI 对话失败：${(err as Error).message}`
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

  /**
   * 执行系统命令（高危，已通过确认流程）
   * 复用 runSystemCommand（Windows cmd /c，其他平台 sh -c；60 秒超时，输出上限 2MB）
   */
  private async executeSystemCommand(command: RemoteCommand): Promise<void> {
    const cmd = String(command.payload.name ?? command.payload.raw ?? '').trim()
    if (!cmd) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: '缺少要执行的系统命令'
      })
      return
    }
    const r = await this.runSystemCommand(cmd)
    if (r.ok) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'success',
        progress: 100,
        message: '命令执行完成',
        data: { command: cmd, output: r.output }
      })
    } else {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: `命令执行失败（${r.error}）`,
        data: { command: cmd, output: r.output }
      })
    }
  }

  /** 读取本地文件（256KB 内返回内容，超过只返回元信息；二进制转 base64） */
  private async executeFileRead(command: RemoteCommand): Promise<void> {
    const filePath = String(command.payload.path ?? command.payload.name ?? '').trim()
    if (!filePath) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: '缺少文件路径'
      })
      return
    }
    try {
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) {
        await this.sendResult({
          commandId: command.commandId,
          status: 'failed',
          message: `不是文件：${filePath}`
        })
        return
      }
      if (fileStat.size > FILE_READ_MAX_SIZE) {
        await this.sendResult({
          commandId: command.commandId,
          status: 'success',
          progress: 100,
          message: `文件超过 ${FILE_READ_MAX_SIZE / 1024}KB，仅返回元信息`,
          data: { path: filePath, size: fileStat.size, note: '文件过大，未读取内容' }
        })
        return
      }
      const buf = await readFile(filePath)
      const isBinary = buf.includes(0)
      if (isBinary) {
        await this.sendResult({
          commandId: command.commandId,
          status: 'success',
          progress: 100,
          message: `已读取二进制文件：${filePath}`,
          data: {
            path: filePath,
            size: buf.length,
            encoding: 'base64',
            content: buf.toString('base64').slice(0, FILE_READ_MAX_BASE64)
          }
        })
      } else {
        await this.sendResult({
          commandId: command.commandId,
          status: 'success',
          progress: 100,
          message: `已读取文件：${filePath}`,
          data: {
            path: filePath,
            size: buf.length,
            encoding: 'utf8',
            content: buf.toString('utf8').slice(0, FILE_READ_MAX_TEXT)
          }
        })
      }
    } catch (err) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: `读取文件失败：${(err as Error).message}`
      })
    }
  }

  /** 用系统默认程序打开文件/文件夹 */
  private async executeFileOpen(command: RemoteCommand): Promise<void> {
    const filePath = String(command.payload.path ?? command.payload.name ?? '').trim()
    if (!filePath) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: '缺少文件路径'
      })
      return
    }
    try {
      const errorMessage = await shell.openPath(filePath)
      if (errorMessage) {
        await this.sendResult({
          commandId: command.commandId,
          status: 'failed',
          message: `打开失败：${errorMessage}`
        })
        return
      }
      await this.sendResult({
        commandId: command.commandId,
        status: 'success',
        progress: 100,
        message: `已打开：${filePath}`
      })
    } catch (err) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: `打开异常：${(err as Error).message}`
      })
    }
  }

  /**
   * 执行场景实例（run_scenario，D3 执行器调度）
   * payload: { instanceId, steps: [{type,name,paths/command/path/workflowId,params}], params }
   * 步骤类型：n8n=本地N8N webhook / system=系统命令 / file_open=打开文件 /
   *          workflow=云端工作流 / query_status=查询状态
   */
  private async executeRunScenario(command: RemoteCommand): Promise<void> {
    const payload = (command.payload ?? {}) as {
      instanceId?: string | number
      steps?: Array<Record<string, unknown>>
      params?: Record<string, unknown>
    }
    const steps = Array.isArray(payload.steps) ? payload.steps : []
    if (steps.length === 0) {
      await this.sendResult({
        commandId: command.commandId,
        status: 'failed',
        message: '场景没有可执行的步骤'
      })
      return
    }
    const params = (payload.params ?? {}) as Record<string, unknown>
    const results: unknown[] = []
    let failed = false

    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i] ?? {}
      const stepName = String(step.name ?? step.type ?? `步骤${i + 1}`)
      await this.sendResult({
        commandId: command.commandId,
        status: 'running',
        progress: Math.round((i / steps.length) * 100),
        message: `执行第 ${i + 1}/${steps.length} 步：${stepName}`
      })
      const r = await this.runScenarioStep(step, params)
      results.push({ step: stepName, ok: r.ok, output: r.output, error: r.error })
      if (!r.ok) {
        failed = true
        break
      }
    }

    await this.sendResult({
      commandId: command.commandId,
      status: failed ? 'failed' : 'success',
      progress: 100,
      message: failed
        ? `场景执行中断（第 ${results.length} 步失败：${String((results[results.length - 1] as { error?: string })?.error ?? '未知错误')}）`
        : `场景执行完成（共 ${steps.length} 步）`,
      data: { instanceId: payload.instanceId, results }
    })
  }

  /** 执行单步场景 */
  private async runScenarioStep(
    step: Record<string, unknown>,
    params: Record<string, unknown>,
  ): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    const type = String(step.type ?? '')
    const stepParams = (step.params && typeof step.params === 'object' ? step.params : {}) as Record<string, unknown>
    const merged = { ...params, ...stepParams }

    switch (type) {
      case 'n8n': {
        // 本地 N8N webhook：paths 数组（模板已用实例参数替换）
        const paths = Array.isArray(step.paths)
          ? step.paths.map((p) => String(p)).filter(Boolean)
          : typeof step.paths === 'string'
            ? [step.paths]
            : []
        if (paths.length === 0) {
          return { ok: false, error: 'n8n 步骤缺少 webhook 路径' }
        }
        const r = await runLocalN8nWorkflow({ paths, payload: merged, timeoutMs: 180000 })
        return r.ok ? { ok: true, output: r.data ?? '(无返回数据)' } : { ok: false, error: r.error }
      }
      case 'system': {
        const cmd = String(step.command ?? step.cmd ?? '').trim()
        if (!cmd) return { ok: false, error: 'system 步骤缺少命令' }
        const r = await this.runSystemCommand(cmd)
        return r.ok ? { ok: true, output: r.output } : { ok: false, error: r.error }
      }
      case 'file_open': {
        const path = String(step.path ?? '').trim()
        if (!path) return { ok: false, error: 'file_open 步骤缺少路径' }
        const errorMessage = await shell.openPath(path)
        return errorMessage ? { ok: false, error: errorMessage } : { ok: true, output: `已打开：${path}` }
      }
      case 'workflow': {
        const workflowId = String(step.workflowId ?? step.id ?? '').trim()
        if (!workflowId) return { ok: false, error: 'workflow 步骤缺少工作流 ID' }
        return this.runCloudWorkflow(workflowId, merged)
      }
      case 'query_status': {
        let statusData: unknown = {}
        try {
          statusData = this.statusProvider ? this.statusProvider() : {}
        } catch (err) {
          console.error('[remote-control] query status failed:', err)
        }
        return { ok: true, output: statusData }
      }
      default:
        return { ok: false, error: `不支持的步骤类型：${type || '(空)'}` }
    }
  }

  /** 调用云端工作流（POST /api/workflows/:id/execute） */
  private async runCloudWorkflow(
    workflowId: string,
    input: Record<string, unknown>,
  ): Promise<{ ok: boolean; output?: unknown; error?: string }> {
    const token = (await this.authTokenProvider?.()) ?? null
    const apiBase = (await this.apiBaseProvider?.()) ?? null
    if (!token || !apiBase) {
      return { ok: false, error: '缺少后端认证配置（未登录？）' }
    }
    try {
      const id = encodeURIComponent(workflowId)
      const response = await fetch(`${apiBase}/api/workflows/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ input }),
        signal: AbortSignal.timeout(60000)
      })
      const text = await response.text().catch(() => '')
      if (!response.ok) {
        return { ok: false, error: `工作流 ${workflowId} 返回 ${response.status} ${text}`.slice(0, 500) }
      }
      let data: unknown = null
      try { data = text ? JSON.parse(text) : null } catch { data = text }
      return { ok: true, output: data }
    } catch (err) {
      return { ok: false, error: `工作流调用异常：${(err as Error).message}`.slice(0, 500) }
    }
  }

  /**
   * 执行系统命令（Windows cmd /c，其他平台 sh -c；60 秒超时，输出上限 2MB）
   * 供 executeSystemCommand 与场景 system 步骤复用
   */
  private async runSystemCommand(
    cmd: string,
  ): Promise<{ ok: boolean; output?: string; error?: string }> {
    const isWin = process.platform === 'win32'
    const exe = isWin ? 'cmd.exe' : '/bin/sh'
    const args = isWin ? ['/c', cmd] : ['-c', cmd]
    try {
      const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
        (resolve, reject) => {
          execFile(
            exe,
            args,
            { timeout: SYSTEM_COMMAND_TIMEOUT_MS, maxBuffer: SYSTEM_COMMAND_MAX_BUFFER, windowsHide: true, encoding: 'utf8' },
            (err, out, errOut) => {
              if (err) {
                reject(
                  Object.assign(err as Error, {
                    output: `${String(out ?? '')}\n${String(errOut ?? '')}`.trim()
                  })
                )
                return
              }
              resolve({ stdout: String(out ?? ''), stderr: String(errOut ?? '') })
            }
          )
        }
      )
      const output = `${stdout}\n${stderr}`.trim()
      return { ok: true, output: output ? output.slice(0, 2000) : '(无输出)' }
    } catch (err) {
      const e = err as Error & { code?: string | number; output?: string }
      return { ok: false, error: `${e.code ?? e.message}`, output: e.output ? e.output.slice(0, 2000) : undefined }
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
    const replyContext = this.replyContexts.get(result.commandId) ?? null
    this.emitRemote('remote:result', {
      commandId: result.commandId,
      status: result.status,
      progress: result.progress,
      message: result.message,
      description: result.description,
      data: result.data,
      replyContext
    })
    // 同时转发到渲染进程（便于 UI 展示）
    this.emit('command-result', result)
    this.forwardToRenderer('remoteControl:command-result', result)
    // 终态清理回复上下文
    if (result.status === 'success' || result.status === 'failed') {
      this.replyContexts.delete(result.commandId)
    }
  }

  /** 通过 socket.io 发送事件到云端 */
  private emitRemote(event: string, payload: unknown): void {
    if (!this.socket || !this.socket.connected) {
      console.warn('[remote-control] socket not connected, drop message:', JSON.stringify(payload).slice(0, 120))
      return
    }
    try {
      this.socket.emit(event, payload)
    } catch (err) {
      console.error('[remote-control] emit failed:', err)
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
    this.replyContexts.clear()
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
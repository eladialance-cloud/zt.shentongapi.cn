// WebSocketClient - 基于 socket.io-client 的 WebSocket 客户端封装
//
// 核心能力：
// 1. 连接配置：transports=['websocket']、autoConnect=false、自动重连
// 2. 鉴权：连接时携带 auth: { token: accessToken }
// 3. 心跳：每 30s 发送 'ping'，60s 无响应触发重连
// 4. 事件监听：7 类业务推送 + 连接/断开/错误
// 5. 增量拉取：重连后 emit('sync:pull')，监听 sync:pull:result
//
// 事件设计：
// - ws:connected     连接成功
// - ws:disconnected  连接断开
// - ws:error         连接错误
// - ws:sync:result   增量拉取结果（重连后自动触发）
// - agent:updated / workflow:template:updated / plugin:updated / ...
//   7 类业务推送事件直接透传

import { io, type Socket } from 'socket.io-client'
import { useAuthStore } from '@/store/auth'

/** 增量拉取支持的实体类型 */
const SYNC_TYPES = [
  'agent',
  'workflow_template',
  'plugin',
  'credits',
  'announcement',
  'model',
  'user_level'
]

/** 推送事件类型联合 */
export type WsPushEvent =
  | 'agent:updated'
  | 'workflow:template:updated'
  | 'plugin:updated'
  | 'credits:updated'
  | 'announcement:new'
  | 'model:updated'
  | 'user:level:updated'

/** WebSocketClient 自定义事件 */
export type WsClientEvent =
  | 'ws:connected'
  | 'ws:disconnected'
  | 'ws:error'
  | 'ws:sync:result'
  | WsPushEvent

type EventHandler = (...args: unknown[]) => void

/** 心跳配置 */
const HEARTBEAT_INTERVAL = 30_000 // 30 秒发送一次 ping
const HEARTBEAT_TIMEOUT = 60_000 // 60 秒无 pong 响应视为超时

class WebSocketClient {
  private socket: Socket | null = null
  private token: string | null = null

  /** 心跳定时器 */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  /** 最近一次收到 pong 的时间戳 */
  private lastPongAt = 0

  /** 最近一次同步时间（用于增量拉取） */
  private lastSyncTime: Date | null = null

  /** 事件处理器映射 */
  private handlers = new Map<string, Set<EventHandler>>()

  /** 是否已手动连接 */
  private connected = false

  // ===== 事件系统 =====

  on(event: WsClientEvent, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
  }

  off(event: WsClientEvent, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler)
  }

  private emit(event: WsClientEvent, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(...args)
      } catch (err) {
        console.error(`[ws-client] handler error for "${event}":`, err)
      }
    })
  }

  // ===== 连接管理 =====

  /** 连接 WebSocket */
  connect(token?: string): void {
    const accessToken = token ?? useAuthStore.getState().accessToken
    if (!accessToken) {
      console.warn('[ws-client] no access token, skip connect')
      return
    }

    // 已连接且 token 未变则跳过
    if (this.socket?.connected && this.token === accessToken) return

    // 先断开旧连接
    this.disconnect()

    this.token = accessToken
    this.connected = true
    this.lastPongAt = Date.now()

    const url = import.meta.env.VITE_WS_URL || 'http://localhost:3001'
    this.socket = io(url, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      reconnectionAttempts: Infinity,
      auth: { token: accessToken }
    })

    this.registerSocketEvents()
    this.socket.connect()
  }

  /** 断开连接 */
  disconnect(): void {
    this.stopHeartbeat()
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
    this.token = null
    this.connected = false
  }

  /** 是否已连接 */
  isConnected(): boolean {
    return this.socket?.connected ?? false
  }

  /** 设置最近同步时间（供 SyncService 调用） */
  setLastSyncTime(date: Date): void {
    this.lastSyncTime = date
  }

  /** 主动发起增量拉取 */
  requestSyncPull(since?: Date, types?: string[]): void {
    if (!this.socket?.connected) {
      console.warn('[ws-client] not connected, skip sync:pull')
      return
    }
    const payload = {
      since: (since ?? this.lastSyncTime ?? new Date(0)).toISOString(),
      types: types ?? SYNC_TYPES
    }
    this.socket.emit('sync:pull', payload)
  }

  // ===== 内部实现 =====

  /** 注册 socket.io 事件监听 */
  private registerSocketEvents(): void {
    if (!this.socket) return

    // 连接成功
    this.socket.on('connect', () => {
      console.log('[ws-client] connected')
      this.lastPongAt = Date.now()
      this.startHeartbeat()
      this.emit('ws:connected')

      // 重连后自动增量拉取
      this.requestSyncPull()
    })

    // 连接断开
    this.socket.on('disconnect', (reason: string) => {
      console.log('[ws-client] disconnected:', reason)
      this.stopHeartbeat()
      this.emit('ws:disconnected', reason)
    })

    // 连接错误
    this.socket.on('connect_error', (err: Error) => {
      console.error('[ws-client] connect error:', err.message)
      this.emit('ws:error', err)
    })

    // pong 响应（心跳）
    this.socket.on('pong', () => {
      this.lastPongAt = Date.now()
    })

    // 增量拉取结果
    this.socket.on('sync:pull:result', (data: unknown) => {
      // 更新最近同步时间
      this.lastSyncTime = new Date()
      this.emit('ws:sync:result', data)
    })

    // 7 类业务推送事件
    const pushEvents: WsPushEvent[] = [
      'agent:updated',
      'workflow:template:updated',
      'plugin:updated',
      'credits:updated',
      'announcement:new',
      'model:updated',
      'user:level:updated'
    ]
    pushEvents.forEach((event) => {
      this.socket!.on(event, (data: unknown) => {
        this.emit(event, data)
      })
    })
  }

  // ===== 心跳 =====

  /** 启动心跳定时器 */
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.socket?.connected) return

      // 检查心跳超时
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT) {
        console.warn('[ws-client] heartbeat timeout, forcing reconnect')
        this.socket.disconnect()
        // socket.io 自动重连机制会尝试重新连接
        this.socket.connect()
        return
      }

      // 发送 ping
      this.socket.emit('ping')
    }, HEARTBEAT_INTERVAL)
  }

  /** 停止心跳定时器 */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}

/** WebSocket 客户端单例 */
export const wsClient = new WebSocketClient()
export default wsClient

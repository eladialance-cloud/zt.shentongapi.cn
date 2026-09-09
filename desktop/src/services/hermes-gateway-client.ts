// Hermes gateway JSON-RPC 客户端（渲染层；DOM WebSocket）
// 端点：ws://127.0.0.1:8642/api/ws?token=...（token 由主进程生成，避免持久暴露）
// 方法：session.create / prompt.submit / prompt.background / slash.exec / session.cwd.set / commands.catalog
// 事件：message.delta / message.complete / reasoning.delta / tool.start / tool.complete / clarify.request 等

export interface HermesGatewayEvent {
  type: string
  payload?: unknown
  session_id?: string
}

export interface HermesGatewayWsOptions {
  /** 返回带 token 的 ws url；error 表示不可用 */
  wsUrl: () => Promise<{ wsUrl?: string; error?: string }>
  /** 可注入 socket 工厂（默认 new WebSocket）便于单测 */
  socketFactory?: (url: string) => WebSocket
}

export interface HermesGatewayHandle {
  readonly connected: boolean
  connect(): Promise<{ ok: boolean; error?: string }>
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<{ ok: boolean; result?: T; error?: string }>
  close(): void
  onEvent(cb: (e: HermesGatewayEvent) => void): () => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 归一化 gateway 通知（type 直传 / {method:'event',params} / {method:'...'}） */
export function normalizeGatewayNotification(value: unknown): HermesGatewayEvent | null {
  if (!isRecord(value)) return null
  const n = value as { type?: unknown; method?: unknown; params?: unknown; payload?: unknown; session_id?: unknown }
  if (typeof n.type === 'string') {
    return { type: n.type, payload: n.payload, session_id: typeof n.session_id === 'string' ? n.session_id : undefined }
  }
  if (n.method === 'event' && isRecord(n.params)) {
    const p = n.params
    if (typeof p.type === 'string') {
      return { type: p.type, payload: p.payload, session_id: typeof p.session_id === 'string' ? p.session_id : undefined }
    }
  }
  if (typeof n.method === 'string') {
    const p = isRecord(n.params) ? n.params : {}
    return { type: n.method, payload: p.payload, session_id: typeof p.session_id === 'string' ? p.session_id : undefined }
  }
  return null
}

const CONNECT_TIMEOUT_MS = 5000
const REQUEST_TIMEOUT_MS = 30000

export function createHermesGatewayHandle(opts: HermesGatewayWsOptions): HermesGatewayHandle {
  const socketFactory = opts.socketFactory ?? ((u: string) => new WebSocket(u))
  let socket: WebSocket | null = null
  let nextId = 1
  let eventCbs: Array<(e: HermesGatewayEvent) => void> = []
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()

  function rejectPending(message: string): void {
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new Error(message))
    }
    pending.clear()
  }

  function handleMessage(ev: MessageEvent): void {
    let msg: unknown
    try {
      msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data
    } catch {
      return
    }
    if (isRecord(msg) && 'id' in msg && !('method' in msg)) {
      const id = msg.id as number
      const p = pending.get(id)
      if (!p) return
      pending.delete(id)
      clearTimeout(p.timer)
      if (msg.error) {
        const message =
          typeof msg.error === 'string'
            ? msg.error
            : isRecord(msg.error) && typeof msg.error.message === 'string'
              ? msg.error.message
              : 'gateway 请求失败'
        p.reject(new Error(message))
      } else {
        p.resolve(msg.result)
      }
      return
    }
    const n = normalizeGatewayNotification(msg)
    if (n) eventCbs.forEach((cb) => cb(n))
  }

  const handle: HermesGatewayHandle = {
    get connected() {
      return !!socket && socket.readyState === WebSocket.OPEN
    },
    async connect() {
      handle.close()
      const { wsUrl, error } = await opts.wsUrl()
      if (!wsUrl) return { ok: false, error: error || 'gateway url 不可用' }
      return new Promise((resolve) => {
        let settled = false
        const s = socketFactory(wsUrl)
        socket = s
        const timer = setTimeout(() => {
          if (settled) return
          settled = true
          if (socket === s) socket = null
          try { s.close() } catch { /* noop */ }
          resolve({ ok: false, error: 'gateway 连接超时' })
        }, CONNECT_TIMEOUT_MS)
        const fail = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (socket === s) socket = null
          resolve({ ok: false, error: '无法连接 Hermes gateway' })
        }
        const onOpen = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          s.removeEventListener('error', fail)
          resolve({ ok: true })
        }
        const onClose = () => {
          if (socket === s) socket = null
          rejectPending('gateway 已关闭')
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve({ ok: false, error: 'gateway 连接已关闭' })
          }
        }
        s.addEventListener('open', onOpen, { once: true })
        s.addEventListener('error', fail, { once: true })
        s.addEventListener('close', onClose)
        s.addEventListener('message', handleMessage)
      })
    },
    async request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<{ ok: boolean; result?: T; error?: string }> {
      const s = socket
      if (!s || s.readyState !== WebSocket.OPEN) return { ok: false, error: 'gateway 未连接' }
      const id = nextId++
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(id)
          resolve({ ok: false, error: 'gateway 请求超时: ' + method })
        }, REQUEST_TIMEOUT_MS)
        pending.set(id, {
          resolve: (v) => resolve({ ok: true, result: v as T }),
          reject: (e) => resolve({ ok: false, error: e.message }),
          timer,
        })
        try {
          s.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
        } catch (err) {
          clearTimeout(timer)
          pending.delete(id)
          resolve({ ok: false, error: err instanceof Error ? err.message : String(err) })
        }
      })
    },
    close() {
      const s = socket
      socket = null
      rejectPending('gateway 已关闭')
      if (s && (s.readyState === WebSocket.CONNECTING || s.readyState === WebSocket.OPEN)) s.close()
    },
    onEvent(cb) {
      eventCbs = [...eventCbs, cb]
      return () => {
        eventCbs = eventCbs.filter((x) => x !== cb)
      }
    },
  }

  return handle
}

export default { createHermesGatewayHandle, normalizeGatewayNotification }

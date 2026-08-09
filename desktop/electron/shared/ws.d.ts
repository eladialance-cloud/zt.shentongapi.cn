/**
 * ws 最小类型声明（本地提供，避免额外安装 @types/ws）。
 * 仅覆盖 OpenClaw 网关客户端用到的 API。
 */
declare module 'ws' {
  import { EventEmitter } from 'node:events'

  export interface WebSocketData {
    toString(): string
  }

  export class WebSocket extends EventEmitter {
    static OPEN: number
    static CONNECTING: number
    static CLOSING: number
    static CLOSED: number
    readonly readyState: number
    readonly url: string
    constructor(address: string, options?: Record<string, unknown>)
    send(data: string, cb?: (err?: Error) => void): void
    close(code?: number, reason?: string): void
    terminate(): void
    on(event: 'open', listener: () => void): this
    on(event: 'message', listener: (data: WebSocketData) => void): this
    on(event: 'error', listener: (err: Error) => void): this
    on(event: 'close', listener: (code: number, reason: string) => void): this
  }

  export default WebSocket
}

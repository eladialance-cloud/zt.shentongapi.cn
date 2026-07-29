/**
 * Office WebSocket 客户端兼容层
 *
 * 原文件曾在 tsconfig.web.json 中被排除，当前为最小化 stub 实现，
 * 仅保证 OfficeIsoCanvas 的类型检查与运行时引用不报错。
 * 真实 WebSocket 接入可在此替换为 socket.io-client 等实现。
 */

import type { AIEmployeeStatus } from '@/pages/Office/types'

/** WebSocket 推送的状态更新 */
export interface OfficeStatusUpdate {
  employeeId: string
  status: AIEmployeeStatus
  reason?: string
}

/** Office WebSocket 客户端接口 */
export interface OfficeWebSocketClient {
  /** 订阅状态更新，返回取消订阅函数 */
  subscribe(callback: (update: OfficeStatusUpdate) => void): () => void
  /** 建立连接 */
  connect(): void
  /** 断开连接 */
  disconnect(): void
}

class NoopOfficeWebSocketClient implements OfficeWebSocketClient {
  private listeners: Array<(update: OfficeStatusUpdate) => void> = []

  subscribe(callback: (update: OfficeStatusUpdate) => void): () => void {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback)
    }
  }

  connect(): void {
    // noop stub: 不发起真实连接
  }

  disconnect(): void {
    this.listeners = []
  }
}

/**
 * 创建 Office WebSocket 客户端
 * @returns 兼容 OfficeWebSocketClient 的 noop 实例；当前返回 null 可由调用方降级为 mock 状态推送
 */
export function createOfficeWebSocket(): OfficeWebSocketClient | null {
  return new NoopOfficeWebSocketClient()
}

// OfflineQueue - 离线调用队列
//
// 职责：
// 1. enqueue(item): 将离线操作写入 local_sync_queue 表
// 2. isOnline(): 检查网络状态
// 3. 监听 online/offline 事件，状态变化时通知 SyncService
// 4. 网络恢复后自动触发 SyncService.pushPendingQueue
//
// 与 SyncService 的集成：通过 onOnline 回调避免循环依赖

import type { SyncQueueItem } from '@shared/types'

type OnlineCallback = () => void

class OfflineQueue {
  /** 当前网络状态 */
  private online = typeof navigator !== 'undefined' ? navigator.onLine : true
  /** 网络恢复回调（由 SyncService 注册） */
  private onOnlineCallback: OnlineCallback | null = null
  /** 是否已绑定事件监听 */
  private bound = false

  constructor() {
    this.bindEvents()
  }

  /** 入队：写入 local_sync_queue */
  async enqueue(item: SyncQueueItem): Promise<void> {
    if (!window.electronAPI?.syncQueue) {
      console.warn('[offline-queue] syncQueue API not available')
      return
    }
    try {
      await window.electronAPI.syncQueue.enqueue(item)
    } catch (err) {
      console.error('[offline-queue] enqueue failed:', err)
      throw err
    }
  }

  /** 当前是否在线 */
  isOnline(): boolean {
    return this.online
  }

  /** 注册网络恢复回调（由 SyncService 调用） */
  onOnline(callback: OnlineCallback): void {
    this.onOnlineCallback = callback
  }

  // ===== 内部实现 =====

  /** 绑定 window online/offline 事件 */
  private bindEvents(): void {
    if (this.bound || typeof window === 'undefined') return
    this.bound = true

    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)
  }

  /** 网络恢复 */
  private handleOnline = (): void => {
    if (this.online) return // 已是在线状态，忽略
    this.online = true
    console.log('[offline-queue] network online')

    // 通知 SyncService 执行上行同步
    if (this.onOnlineCallback) {
      // 异步调用，避免阻塞事件处理
      Promise.resolve()
        .then(() => this.onOnlineCallback?.())
        .catch((err) => console.error('[offline-queue] onOnline callback error:', err))
    }
  }

  /** 网络断开 */
  private handleOffline = (): void => {
    if (!this.online) return
    this.online = false
    console.log('[offline-queue] network offline')
  }
}

/** 离线队列单例 */
export const offlineQueue = new OfflineQueue()
export default offlineQueue

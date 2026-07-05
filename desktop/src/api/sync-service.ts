// SyncService - 客户端 ↔ 云端数据同步
//
// 上行同步（客户端 → 云端）：
//   - pushPendingQueue(): 读取 local_sync_queue 的 pending 记录，批量 POST /sync/batch
//   - 每批最多 100 条；成功→synced，失败→retry_count++（3 次后标 failed）
//
// 下行同步（云端 → 客户端）：
//   - 监听 wsClient 7 类推送事件 → 更新本地缓存（emit 事件供 store 监听）
//   - pullIncremental(since, types): GET /sync/pull 获取增量数据
//
// 触发时机：
//   - 网络恢复（offlineQueue.onOnline）→ pushPendingQueue
//   - 定时任务（每 5 分钟）→ pushPendingQueue
//   - 应用启动 → 一次增量拉取

import { httpClient } from './http-client'
import { wsClient } from './ws-client'
import { offlineQueue } from './offline-queue'
import type { SyncQueueItem, SyncQueueRow } from '@shared/types'

/** 上行同步批量响应 */
interface SyncBatchResponse {
  success: boolean
  processed: number
  errors: Array<{ client_txn_id: string; error: string }>
}

/** 下行拉取响应（各实体类型的增量数据） */
interface SyncPullResponse {
  agents?: unknown[]
  workflowTemplates?: unknown[]
  plugins?: unknown[]
  credits?: unknown
  announcements?: unknown[]
  models?: unknown[]
  userLevel?: unknown
  [key: string]: unknown
}

/** SyncService 事件 */
export type SyncServiceEvent =
  | 'sync:push:complete'
  | 'sync:push:error'
  | 'sync:pull:complete'
  | 'sync:cache:updated'

type EventHandler = (...args: unknown[]) => void

/** 每批最大条数 */
const BATCH_SIZE = 100
/** 最大重试次数（超过则标记 failed） */
const MAX_RETRY = 3
/** 定时同步间隔（5 分钟） */
const SYNC_INTERVAL = 5 * 60 * 1000

/** 缓存更新事件类型 → 推送事件名映射 */
const PUSH_EVENT_NAMES = [
  'agent:updated',
  'workflow:template:updated',
  'plugin:updated',
  'credits:updated',
  'announcement:new',
  'model:updated',
  'user:level:updated'
] as const

class SyncService {
  /** 定时器 */
  private syncTimer: ReturnType<typeof setInterval> | null = null
  /** 最近同步时间（用于增量拉取） */
  private lastSyncTime: Date | null = null
  /** 是否正在执行上行同步（防止并发） */
  private pushing = false
  /** 是否正在执行下行拉取 */
  private pulling = false
  /** 是否已初始化 */
  private initialized = false

  /** 事件处理器 */
  private handlers = new Map<string, Set<EventHandler>>()

  constructor() {
    // 暂不自动初始化，等待 init() 调用
  }

  // ===== 事件系统 =====

  on(event: SyncServiceEvent, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
  }

  off(event: SyncServiceEvent, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler)
  }

  private emit(event: SyncServiceEvent, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(...args)
      } catch (err) {
        console.error(`[sync-service] handler error for "${event}":`, err)
      }
    })
  }

  // ===== 初始化 =====

  /** 初始化同步服务（应用启动时调用） */
  init(): void {
    if (this.initialized) return
    this.initialized = true

    // 1. 注册网络恢复回调 → 触发上行同步
    offlineQueue.onOnline(() => {
      this.pushPendingQueue().catch((err) => {
        console.error('[sync-service] online push error:', err)
      })
    })

    // 2. 监听 wsClient 推送事件 → 更新本地缓存
    this.registerPushListeners()

    // 3. 监听 wsClient 增量拉取结果
    wsClient.on('ws:sync:result', (data: unknown) => {
      this.handlePullResult(data as SyncPullResponse)
    })

    // 4. 启动定时上行同步（每 5 分钟）
    this.syncTimer = setInterval(() => {
      this.pushPendingQueue().catch((err) => {
        console.error('[sync-service] timer push error:', err)
      })
    }, SYNC_INTERVAL)

    // 5. 应用启动时执行一次增量拉取
    this.pullIncremental(this.lastSyncTime ?? new Date(0)).catch((err) => {
      console.error('[sync-service] startup pull error:', err)
    })
  }

  /** 销毁（登出时调用） */
  destroy(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    this.initialized = false
  }

  // ===== 上行同步 =====

  /** 推送待同步队列到云端 */
  async pushPendingQueue(): Promise<void> {
    if (this.pushing) {
      console.log('[sync-service] push already in progress, skip')
      return
    }
    if (!offlineQueue.isOnline()) {
      console.log('[sync-service] offline, skip push')
      return
    }

    this.pushing = true
    try {
      // 循环处理直到没有 pending 记录
      let hasMore = true
      while (hasMore) {
        const items = await this.getPendingItems()
        if (items.length === 0) {
          hasMore = false
          break
        }

        await this.pushBatch(items)

        // 如果取满了一批，可能还有更多
        hasMore = items.length >= BATCH_SIZE
      }
      this.emit('sync:push:complete')
    } catch (err) {
      console.error('[sync-service] push error:', err)
      this.emit('sync:push:error', err)
    } finally {
      this.pushing = false
    }
  }

  /** 读取一批 pending 记录 */
  private async getPendingItems(): Promise<SyncQueueRow[]> {
    if (!window.electronAPI?.syncQueue) return []
    return window.electronAPI.syncQueue.getPending(BATCH_SIZE)
  }

  /** 推送一批记录到云端 */
  private async pushBatch(items: SyncQueueRow[]): Promise<void> {
    // 构造请求体（只取 SyncQueueItem 需要的字段）
    const payload: { items: SyncQueueItem[] } = {
      items: items.map((row) => ({
        client_txn_id: row.client_txn_id,
        entity_type: row.entity_type,
        entity_id: row.entity_id,
        operation: row.operation,
        payload: row.payload
      }))
    }

    try {
      const response = await httpClient.post<SyncBatchResponse>('/sync/batch', payload)

      // 构造错误索引
      const errorMap = new Map<string, string>()
      if (response.errors?.length) {
        for (const err of response.errors) {
          errorMap.set(err.client_txn_id, err.error)
        }
      }

      // 逐条更新状态
      for (const item of items) {
        const errMsg = errorMap.get(item.client_txn_id)
        if (errMsg) {
          // 该条失败
          await this.markFailed(item, errMsg)
        } else {
          // 该条成功
          await this.markSynced(item)
        }
      }
    } catch (err) {
      // 整批请求失败（网络错误等），所有条目重试
      const errorMsg = err instanceof Error ? err.message : String(err)
      for (const item of items) {
        await this.markFailed(item, errorMsg)
      }
      throw err
    }
  }

  /** 标记为已同步 */
  private async markSynced(item: SyncQueueRow): Promise<void> {
    if (!window.electronAPI?.syncQueue) return
    await window.electronAPI.syncQueue.updateStatus(item.id, 'synced', item.retry_count)
  }

  /** 标记为失败（retry_count++，超过 MAX_RETRY 则标 failed） */
  private async markFailed(item: SyncQueueRow, errorMessage: string): Promise<void> {
    if (!window.electronAPI?.syncQueue) return
    const newRetryCount = item.retry_count + 1
    if (newRetryCount >= MAX_RETRY) {
      // 超过最大重试次数，标记为 failed
      await window.electronAPI.syncQueue.updateStatus(
        item.id,
        'failed',
        newRetryCount,
        `Max retries exceeded: ${errorMessage}`
      )
    } else {
      // 保持 pending，下次继续重试
      await window.electronAPI.syncQueue.updateStatus(
        item.id,
        'pending',
        newRetryCount,
        errorMessage
      )
    }
  }

  // ===== 下行同步 =====

  /** 增量拉取（云端 → 客户端） */
  async pullIncremental(since: Date, types?: string[]): Promise<void> {
    if (this.pulling) {
      console.log('[sync-service] pull already in progress, skip')
      return
    }
    if (!offlineQueue.isOnline()) {
      console.log('[sync-service] offline, skip pull')
      return
    }

    this.pulling = true
    try {
      const params: Record<string, string> = {
        since: since.toISOString()
      }
      if (types && types.length > 0) {
        params.types = types.join(',')
      }

      const response = await httpClient.get<SyncPullResponse>('/sync/pull', { params })
      this.handlePullResult(response)

      // 更新最近同步时间
      this.lastSyncTime = new Date()
      wsClient.setLastSyncTime(this.lastSyncTime)
    } catch (err) {
      console.error('[sync-service] pull error:', err)
    } finally {
      this.pulling = false
    }
  }

  /** 处理增量拉取结果 / WS 推送结果 */
  private handlePullResult(data: SyncPullResponse): void {
    if (!data) return

    // 更新最近同步时间
    this.lastSyncTime = new Date()
    wsClient.setLastSyncTime(this.lastSyncTime)

    // 触发缓存更新事件（供 store 监听）
    this.emit('sync:pull:complete', data)
    this.emit('sync:cache:updated', data)
  }

  /** 注册 wsClient 推送事件监听 */
  private registerPushListeners(): void {
    for (const eventName of PUSH_EVENT_NAMES) {
      wsClient.on(eventName, (data: unknown) => {
        // 收到推送后更新缓存（emit 事件供 store 处理）
        this.emit('sync:cache:updated', { type: eventName, data })
      })
    }

    // 重连后的增量拉取结果
    wsClient.on('ws:connected', () => {
      // wsClient 内部已自动触发 sync:pull，这里不再重复
    })
  }

  // ===== 状态查询 =====

  /** 获取最近同步时间 */
  getLastSyncTime(): Date | null {
    return this.lastSyncTime
  }
}

/** 同步服务单例 */
export const syncService = new SyncService()
export default syncService

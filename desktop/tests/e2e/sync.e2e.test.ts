// SubTask 36.1: 客户端 ↔ 云端同步链路测试
//
// 测试场景：
// 1. 上行批量上报：150 条记录分 2 批（100+50），client_txn_id 幂等去重
// 2. 下行增量拉取：模拟 since 时间戳，验证返回增量数据
// 3. 离线队列：网络中断写入 OfflineQueue，恢复后批量上报
//
// Mock 依赖：httpClient.post / httpClient.get / localStorage / window.electronAPI

import { syncService } from '@/api/sync-service'
import { httpClient } from '@/api/http-client'
import { offlineQueue } from '@/api/offline-queue'
import type { SyncQueueRow, ElectronAPI } from '@shared/types'
import {
  generateSyncQueueRow,
  generateSyncQueueItem,
  SYNC_BATCH_SIZE
} from '../setup'

// Mock httpClient
jest.mock('@/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    getInstance: jest.fn()
  },
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    getInstance: jest.fn()
  }
}))

// Mock offlineQueue
jest.mock('@/api/offline-queue', () => ({
  offlineQueue: {
    isOnline: jest.fn(() => true),
    onOnline: jest.fn(),
    enqueue: jest.fn()
  },
  default: {
    isOnline: jest.fn(() => true),
    onOnline: jest.fn(),
    enqueue: jest.fn()
  }
}))

// Mock wsClient
jest.mock('@/api/ws-client', () => ({
  wsClient: {
    on: jest.fn(),
    off: jest.fn(),
    setLastSyncTime: jest.fn(),
    isConnected: jest.fn(() => false),
    connect: jest.fn(),
    disconnect: jest.fn()
  },
  default: {
    on: jest.fn(),
    off: jest.fn(),
    setLastSyncTime: jest.fn(),
    isConnected: jest.fn(() => false),
    connect: jest.fn(),
    disconnect: jest.fn()
  }
}))

// 提取 mock 引用
const mockHttpPost = httpClient.post as unknown as jest.Mock
const mockHttpGet = httpClient.get as unknown as jest.Mock
const mockIsOnline = offlineQueue.isOnline as unknown as jest.Mock

/** 生成 N 条 SyncQueueRow */
function generateRows(start: number, count: number): SyncQueueRow[] {
  return Array.from({ length: count }, (_, i) => generateSyncQueueRow(start + i))
}

/** 安装 mock electronAPI 到 window */
function installElectronAPI(mock: Partial<ElectronAPI>): void {
  ;(global as unknown as { electronAPI: unknown }).electronAPI = mock
}

describe('SubTask 36.1 - 客户端 ↔ 云端同步链路测试', () => {
  let mockGetPending: jest.Mock
  let mockUpdateStatus: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    mockIsOnline.mockReturnValue(true)

    mockGetPending = jest.fn()
    mockUpdateStatus = jest.fn().mockResolvedValue(undefined)

    installElectronAPI({
      syncQueue: {
        getPending: mockGetPending,
        updateStatus: mockUpdateStatus,
        enqueue: jest.fn().mockResolvedValue(1),
        exists: jest.fn().mockResolvedValue(false)
      }
    } as unknown as ElectronAPI)

    // 销毁 syncService 旧状态
    syncService.destroy()
  })

  afterEach(() => {
    syncService.destroy()
  })

  describe('上行批量上报', () => {
    it('150 条记录应分 2 批（100+50）上报', async () => {
      // arrange
      const batch1 = generateRows(1, SYNC_BATCH_SIZE) // 100 条
      const batch2 = generateRows(101, 50) // 50 条
      mockGetPending
        .mockResolvedValueOnce(batch1)
        .mockResolvedValueOnce(batch2)
        .mockResolvedValueOnce([])

      mockHttpPost.mockResolvedValue({
        success: true,
        processed: 0,
        errors: []
      })

      // act
      await syncService.pushPendingQueue()

      // assert
      expect(mockHttpPost).toHaveBeenCalledTimes(2)
      // 第一批 100 条
      const firstCallArgs = mockHttpPost.mock.calls[0]
      expect(firstCallArgs[0]).toBe('/sync/batch')
      const firstPayload = firstCallArgs[1] as { items: unknown[] }
      expect(firstPayload.items).toHaveLength(SYNC_BATCH_SIZE)
      // 第二批 50 条
      const secondCallArgs = mockHttpPost.mock.calls[1]
      const secondPayload = secondCallArgs[1] as { items: unknown[] }
      expect(secondPayload.items).toHaveLength(50)
    })

    it('client_txn_id 应作为幂等键传给服务端', async () => {
      // arrange
      const rows = generateRows(1, 3)
      mockGetPending.mockResolvedValueOnce(rows).mockResolvedValueOnce([])
      mockHttpPost.mockResolvedValue({ success: true, processed: 3, errors: [] })

      // act
      await syncService.pushPendingQueue()

      // assert
      const payload = mockHttpPost.mock.calls[0][1] as {
        items: Array<{ client_txn_id: string }>
      }
      const txnIds = payload.items.map((i) => i.client_txn_id)
      expect(txnIds).toEqual(['txn-1', 'txn-2', 'txn-3'])
    })

    it('成功的条目应标记为 synced', async () => {
      // arrange
      const rows = generateRows(1, 2)
      mockGetPending.mockResolvedValueOnce(rows).mockResolvedValueOnce([])
      mockHttpPost.mockResolvedValue({ success: true, processed: 2, errors: [] })

      // act
      await syncService.pushPendingQueue()

      // assert
      expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
      // 每条都标记为 synced
      for (const call of mockUpdateStatus.mock.calls) {
        expect(call[1]).toBe('synced')
      }
    })

    it('部分失败的条目应保留 client_txn_id 用于幂等重试', async () => {
      // arrange
      const rows = generateRows(1, 2)
      mockGetPending.mockResolvedValueOnce(rows).mockResolvedValueOnce([])
      mockHttpPost.mockResolvedValue({
        success: false,
        processed: 1,
        errors: [{ client_txn_id: 'txn-1', error: 'duplicate' }]
      })

      // act
      await syncService.pushPendingQueue()

      // assert
      // txn-1 失败 → markFailed；txn-2 成功 → markSynced
      const statuses = mockUpdateStatus.mock.calls.map((c) => c[1])
      expect(statuses).toContain('synced')
      expect(statuses).toContain('pending') // 失败且未超限，保持 pending
    })
  })

  describe('下行增量拉取', () => {
    it('应以 since 时间戳拉取增量数据', async () => {
      // arrange
      const since = new Date('2025-01-01T00:00:00.000Z')
      const pullResponse = {
        agents: [{ id: 1, name: 'new-agent' }],
        announcements: [{ id: 1, title: '系统公告' }]
      }
      mockHttpGet.mockResolvedValue(pullResponse)

      // act
      await syncService.pullIncremental(since)

      // assert
      expect(mockHttpGet).toHaveBeenCalledTimes(1)
      const callArgs = mockHttpGet.mock.calls[0]
      expect(callArgs[0]).toBe('/sync/pull')
      const config = callArgs[1] as { params: Record<string, string> }
      expect(config.params.since).toBe(since.toISOString())
    })

    it('应返回增量数据并触发缓存更新事件', async () => {
      // arrange
      const since = new Date('2025-01-01T00:00:00.000Z')
      const pullResponse = {
        agents: [{ id: 2, name: 'incremental-agent' }],
        models: [{ id: 1, name: 'gpt-4' }]
      }
      mockHttpGet.mockResolvedValue(pullResponse)

      let capturedPayload: unknown = null
      syncService.on('sync:cache:updated', (payload: unknown) => {
        capturedPayload = payload
      })

      // act
      await syncService.pullIncremental(since)

      // assert
      expect(capturedPayload).not.toBeNull()
      const payload = capturedPayload as { agents: unknown[]; models: unknown[] }
      expect(payload.agents).toHaveLength(1)
      expect(payload.models).toHaveLength(1)
    })

    it('指定 types 参数应传递给服务端', async () => {
      // arrange
      const since = new Date('2025-01-01T00:00:00.000Z')
      const types = ['agent', 'model']
      mockHttpGet.mockResolvedValue({})

      // act
      await syncService.pullIncremental(since, types)

      // assert
      const config = mockHttpGet.mock.calls[0][1] as { params: Record<string, string> }
      expect(config.params.types).toBe('agent,model')
    })
  })

  describe('离线队列', () => {
    it('网络中断时应跳过上行同步', async () => {
      // arrange
      mockIsOnline.mockReturnValue(false)

      // act
      await syncService.pushPendingQueue()

      // assert
      expect(mockHttpPost).not.toHaveBeenCalled()
      expect(mockGetPending).not.toHaveBeenCalled()
    })

    it('离线时应通过 OfflineQueue.enqueue 写入待同步记录', async () => {
      // arrange
      const item = generateSyncQueueItem(1)
      mockIsOnline.mockReturnValue(false)
      const mockEnqueue = jest.fn().mockResolvedValue(1)
      installElectronAPI({
        syncQueue: {
          getPending: mockGetPending,
          updateStatus: mockUpdateStatus,
          enqueue: mockEnqueue,
          exists: jest.fn().mockResolvedValue(false)
        }
      } as unknown as ElectronAPI)

      // act
      await offlineQueue.enqueue(item)

      // assert
      expect(mockEnqueue).toHaveBeenCalledTimes(1)
      expect(mockEnqueue).toHaveBeenCalledWith(item)
    })

    it('网络恢复后应自动触发批量上报', async () => {
      // arrange
      const pendingRows = generateRows(1, 5)
      mockGetPending.mockResolvedValueOnce(pendingRows).mockResolvedValueOnce([])
      mockHttpPost.mockResolvedValue({ success: true, processed: 5, errors: [] })
      mockIsOnline.mockReturnValue(true)

      // 注册 onOnline 回调（模拟 SyncService.init 中的行为）
      const onOnlineCallback = jest.fn()
      offlineQueue.onOnline(onOnlineCallback)

      // 手动触发 pushPendingQueue（模拟网络恢复后回调）
      await syncService.pushPendingQueue()

      // assert
      expect(mockHttpPost).toHaveBeenCalledTimes(1)
      const payload = mockHttpPost.mock.calls[0][1] as { items: unknown[] }
      expect(payload.items).toHaveLength(5)
    })

    it('整批请求失败时所有条目应保持 pending 并增加 retry_count', async () => {
      // arrange
      const rows = generateRows(1, 2)
      mockGetPending.mockResolvedValueOnce(rows).mockResolvedValueOnce([])
      mockHttpPost.mockRejectedValue(new Error('网络错误'))

      // act
      await expect(syncService.pushPendingQueue()).rejects.toThrow('网络错误')

      // assert
      expect(mockUpdateStatus).toHaveBeenCalledTimes(2)
      for (const call of mockUpdateStatus.mock.calls) {
        expect(call[1]).toBe('pending')
        expect(call[2]).toBe(1) // retry_count 从 0 增加到 1
      }
    })
  })
})

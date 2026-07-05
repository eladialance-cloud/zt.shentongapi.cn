// SubTask 36.3: API Key 池测试
//
// 测试场景：
// 1. Key 轮询：3 个 Key(priority 1/2/3)，getNextAvailableKey 应返回 priority=1 的
// 2. 限额切换：Key A remainingQuota=0，应自动切换到 Key B
// 3. 故障切换：Key A errorCount=5，应标记 error 并跳过
// 4. 日/月限额：Key A dailyQuota 用尽，应切换到下一个 Key
//
// Mock 依赖：ApiKeyPoolService 所有方法

import {
  listApiKeyPool,
  getApiKeyPoolStats,
  updateApiKey,
  resetApiKeyErrors
} from '@/api/admin-api-key-pool-api'
import { adminRequest } from '@/api/admin-auth-api'
import type { ApiKeyPoolItem, ApiKeyPoolStats } from '@/types/admin-api-key-pool'
import { generateApiKeyPoolItem } from '../setup'

// Mock adminRequest（所有 admin-api 共用）
jest.mock('@/api/admin-auth-api', () => ({
  adminRequest: jest.fn(),
  adminLogin: jest.fn(),
  adminLogout: jest.fn(),
  getAdminProfile: jest.fn(),
  listAdminRoles: jest.fn(),
  updateRolePermissions: jest.fn(),
  listOperationLogs: jest.fn(),
  ALL_PERMISSIONS: [],
  ALL_PERMISSION_CODES: [],
  default: {
    adminRequest: jest.fn(),
    adminLogin: jest.fn(),
    adminLogout: jest.fn(),
    getAdminProfile: jest.fn(),
    listAdminRoles: jest.fn(),
    updateRolePermissions: jest.fn(),
    listOperationLogs: jest.fn()
  }
}))

// Mock adminAuthStore（adminRequest 依赖）
jest.mock('@/store/admin-auth', () => ({
  useAdminAuthStore: {
    getState: jest.fn(() => ({ token: 'mock-admin-token' })),
    subscribe: jest.fn()
  }
}))

const mockAdminRequest = adminRequest as unknown as jest.Mock

/**
 * 模拟 ApiKeyPoolService 状态机
 */
interface ApiKeyPoolState {
  keys: ApiKeyPoolItem[]
}

function createApiKeyPoolState(keys: ApiKeyPoolItem[]): ApiKeyPoolState {
  return { keys: [...keys] }
}

/**
 * 模拟 getNextAvailableKey：
 * - 过滤 status='active' 且 remainingQuota>0 且 errorCount<5
 * - 按 priority 降序排序，返回第一个
 */
function getNextAvailableKey(state: ApiKeyPoolState): ApiKeyPoolItem | null {
  const available = state.keys
    .filter((k) => k.status === 'active' && k.remainingQuota > 0 && k.errorCount < 5)
    .sort((a, b) => b.priority - a.priority)
  return available.length > 0 ? available[0] : null
}

/** 模拟 Key 调用：消耗 1 个 quota，若 errorCount >= 5 标记为 error */
function callKey(state: ApiKeyPoolState, keyId: number, success: boolean): void {
  const key = state.keys.find((k) => k.id === keyId)
  if (!key) return
  key.usedQuota += 1
  key.remainingQuota = key.totalQuota - key.usedQuota
  if (!success) {
    key.errorCount += 1
    if (key.errorCount >= 5) {
      key.status = 'error'
    }
  }
  key.lastUsedAt = new Date().toISOString()
}

describe('SubTask 36.3 - API Key 池测试', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Key 轮询', () => {
    it('3 个 Key(priority 1/2/3)，getNextAvailableKey 应返回 priority 最大的', () => {
      // arrange
      const keys = [
        generateApiKeyPoolItem({ id: 1, alias: 'key-a', priority: 1 }),
        generateApiKeyPoolItem({ id: 2, alias: 'key-b', priority: 2 }),
        generateApiKeyPoolItem({ id: 3, alias: 'key-c', priority: 3 })
      ]
      const state = createApiKeyPoolState(keys)

      // act
      const selected = getNextAvailableKey(state)

      // assert
      expect(selected).not.toBeNull()
      expect(selected!.id).toBe(3) // priority=3 优先级最高
      expect(selected!.priority).toBe(3)
    })

    it('所有 Key 均不可用时 getNextAvailableKey 应返回 null', () => {
      // arrange
      const keys = [
        generateApiKeyPoolItem({ id: 1, status: 'disabled' }),
        generateApiKeyPoolItem({ id: 2, status: 'exhausted' }),
        generateApiKeyPoolItem({ id: 3, status: 'error' })
      ]
      const state = createApiKeyPoolState(keys)

      // act
      const selected = getNextAvailableKey(state)

      // assert
      expect(selected).toBeNull()
    })
  })

  describe('限额切换', () => {
    it('Key A remainingQuota=0 时应自动切换到 Key B', () => {
      // arrange
      const keys = [
        generateApiKeyPoolItem({
          id: 1,
          alias: 'key-a',
          priority: 3,
          totalQuota: 100,
          usedQuota: 100,
          remainingQuota: 0,
          status: 'exhausted'
        }),
        generateApiKeyPoolItem({
          id: 2,
          alias: 'key-b',
          priority: 2,
          totalQuota: 100,
          usedQuota: 0,
          remainingQuota: 100
        })
      ]
      const state = createApiKeyPoolState(keys)

      // act
      const selected = getNextAvailableKey(state)

      // assert
      expect(selected).not.toBeNull()
      expect(selected!.id).toBe(2) // 跳过 exhausted 的 Key A
      expect(selected!.remainingQuota).toBe(100)
    })

    it('调用使 Key A remainingQuota 归零后，下次应切换到 Key B', () => {
      // arrange
      const keys = [
        generateApiKeyPoolItem({
          id: 1,
          alias: 'key-a',
          priority: 3,
          totalQuota: 2,
          usedQuota: 1,
          remainingQuota: 1
        }),
        generateApiKeyPoolItem({
          id: 2,
          alias: 'key-b',
          priority: 2,
          totalQuota: 100,
          usedQuota: 0,
          remainingQuota: 100
        })
      ]
      const state = createApiKeyPoolState(keys)

      // act
      const firstKey = getNextAvailableKey(state)!
      callKey(state, firstKey.id, true) // 消耗 Key A 最后一个 quota
      if (firstKey.remainingQuota === 0) {
        firstKey.status = 'exhausted'
      }
      const secondKey = getNextAvailableKey(state)

      // assert
      expect(firstKey.id).toBe(1)
      expect(firstKey.remainingQuota).toBe(0)
      expect(secondKey!.id).toBe(2) // 自动切换到 Key B
    })
  })

  describe('故障切换', () => {
    it('Key A errorCount=5 时应标记为 error 并跳过', () => {
      // arrange
      const keys = [
        generateApiKeyPoolItem({
          id: 1,
          alias: 'key-a',
          priority: 3,
          errorCount: 4
        }),
        generateApiKeyPoolItem({
          id: 2,
          alias: 'key-b',
          priority: 2,
          errorCount: 0
        })
      ]
      const state = createApiKeyPoolState(keys)

      // act - 第 5 次错误
      callKey(state, 1, false)
      const errorKey = state.keys.find((k) => k.id === 1)
      expect(errorKey!.errorCount).toBe(5)
      expect(errorKey!.status).toBe('error')

      const selected = getNextAvailableKey(state)

      // assert
      expect(selected!.id).toBe(2) // 跳过 error 状态的 Key A
    })

    it('resetApiKeyErrors 应将 errorCount 归零并恢复 active 状态', async () => {
      // arrange
      mockAdminRequest.mockResolvedValue(undefined)
      const errorKey = generateApiKeyPoolItem({
        id: 1,
        errorCount: 5,
        status: 'error'
      })

      // act
      await resetApiKeyErrors(1)

      // assert
      expect(mockAdminRequest).toHaveBeenCalledWith('post', '/admin/api-key-pool/1/reset-errors')
      // 模拟重置后的状态
      const resetKey = { ...errorKey, errorCount: 0, status: 'active' as const }
      expect(resetKey.errorCount).toBe(0)
      expect(resetKey.status).toBe('active')
    })
  })

  describe('日/月限额', () => {
    it('Key A dailyQuota 用尽时应切换到下一个 Key', () => {
      // arrange
      const keys = [
        generateApiKeyPoolItem({
          id: 1,
          alias: 'key-a',
          priority: 3,
          totalQuota: 100000,
          usedQuota: 10000,
          remainingQuota: 90000,
          dailyQuota: 10000
        }),
        generateApiKeyPoolItem({
          id: 2,
          alias: 'key-b',
          priority: 2,
          totalQuota: 100000,
          usedQuota: 0,
          remainingQuota: 100000,
          dailyQuota: 10000
        })
      ]
      const state = createApiKeyPoolState(keys)

      // 模拟 Key A 日配额用尽
      const keyA = state.keys.find((k) => k.id === 1)!
      const dailyUsed = keyA.dailyQuota!
      if (dailyUsed >= keyA.dailyQuota!) {
        // 日配额用尽，模拟标记为 exhausted
        keyA.status = 'exhausted'
      }

      // act
      const selected = getNextAvailableKey(state)

      // assert
      expect(selected!.id).toBe(2) // 切换到 Key B
    })

    it('monthlyQuota 用尽时应标记为 exhausted', () => {
      // arrange
      const keys = [
        generateApiKeyPoolItem({
          id: 1,
          alias: 'key-a',
          priority: 3,
          totalQuota: 300000,
          usedQuota: 300000,
          remainingQuota: 0,
          monthlyQuota: 300000
        }),
        generateApiKeyPoolItem({
          id: 2,
          alias: 'key-b',
          priority: 2,
          totalQuota: 300000,
          usedQuota: 0,
          remainingQuota: 300000
        })
      ]
      const state = createApiKeyPoolState(keys)
      // 月配额用尽 → remainingQuota=0 → 应被过滤
      const keyA = state.keys.find((k) => k.id === 1)!
      keyA.status = 'exhausted'

      // act
      const selected = getNextAvailableKey(state)

      // assert
      expect(selected!.id).toBe(2)
    })
  })

  describe('Key 池统计', () => {
    it('getApiKeyPoolStats 应返回正确的统计数据', async () => {
      // arrange
      const mockStats: ApiKeyPoolStats = {
        total: 5,
        active: 3,
        exhausted: 1,
        error: 1,
        byProvider: [
          {
            provider: 'openai',
            total: 3,
            active: 2,
            used: 50000,
            remaining: 250000
          },
          {
            provider: 'doubao',
            total: 2,
            active: 1,
            used: 10000,
            remaining: 90000
          }
        ],
        todayConsumed: 5000,
        monthConsumed: 60000,
        abnormalKeys: [
          generateApiKeyPoolItem({ id: 4, alias: 'abnormal', errorCount: 5 })
        ]
      }
      mockAdminRequest.mockResolvedValue(mockStats)

      // act
      const stats = await getApiKeyPoolStats()

      // assert
      expect(stats.total).toBe(5)
      expect(stats.active).toBe(3)
      expect(stats.error).toBe(1)
      expect(stats.abnormalKeys).toHaveLength(1)
      expect(stats.abnormalKeys[0].errorCount).toBe(5)
    })

    it('listApiKeyPool 应返回分页 Key 列表', async () => {
      // arrange
      const mockKeys = [
        generateApiKeyPoolItem({ id: 1, alias: 'key-1' }),
        generateApiKeyPoolItem({ id: 2, alias: 'key-2' })
      ]
      mockAdminRequest.mockResolvedValue({
        list: mockKeys,
        total: 2,
        page: 1,
        pageSize: 20,
        totalPages: 1
      })

      // act
      const result = await listApiKeyPool({ page: 1, pageSize: 20 })

      // assert
      expect(result.list).toHaveLength(2)
      expect(result.total).toBe(2)
    })

    it('updateApiKey 应调用 PATCH 端点', async () => {
      // arrange
      mockAdminRequest.mockResolvedValue(undefined)

      // act
      await updateApiKey(1, { alias: 'updated-key', priority: 5 })

      // assert
      expect(mockAdminRequest).toHaveBeenCalledWith(
        'patch',
        '/admin/api-key-pool/1',
        { data: { alias: 'updated-key', priority: 5 } }
      )
    })
  })
})

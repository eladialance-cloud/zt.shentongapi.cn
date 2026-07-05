// 测试工具文件 - Mock 工厂函数 + 测试数据生成器 + 常用 mock 数据
//
// 该文件在 jest.config.ts 的 setupFilesAfterEnv 中被引用，
// 同时也作为模块导出供各 e2e 测试文件按需引入。

import type { User } from '@/store/auth'
import type { Agent } from '@/types/agent'
import type { CreditTransaction, CreditAccount } from '@/types/credits'
import type { ApiKeyPoolItem } from '@/types/admin-api-key-pool'
import type { Device } from '@/types/settings'
import type { AdminDevice } from '@/types/admin-user'
import type { WorkflowExecution } from '@/types/workflow'
import type { HermesInstance } from '@/types/hermes'
import type { SyncQueueRow, SyncQueueItem, ElectronAPI } from '@shared/types'

// ===== Mock 工厂函数 =====

/**
 * 创建 HttpClient mock 对象
 * 返回包含 get/post/put/delete/patch 的 mock 函数集合
 */
export function createMockHttpClient() {
  return {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    getInstance: jest.fn()
  }
}

/**
 * 创建 Zustand store mock 对象
 * 提供 getState/setState/subscribe 等基础方法
 */
export function createMockStore<T>(initial: T) {
  let state = initial
  return {
    getState: jest.fn(() => state),
    setState: jest.fn((partial: Partial<T> | ((s: T) => Partial<T>)) => {
      const next = typeof partial === 'function' ? partial(state) : partial
      state = { ...state, ...next }
      return state
    }),
    subscribe: jest.fn(() => jest.fn()),
    destroy: jest.fn()
  }
}

/**
 * 创建 ElectronAPI mock 对象
 * 覆盖 syncQueue / db / device / window / app / updater / service 等命名空间
 */
export function createMockElectronAPI(): ElectronAPI {
  return {
    service: {
      getStatus: jest.fn(),
      status: jest.fn(),
      list: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      restart: jest.fn(),
      checkEnv: jest.fn(),
      install: jest.fn(),
      onStatusChanged: jest.fn(() => jest.fn()),
      onError: jest.fn(() => jest.fn())
    },
    app: {
      getVersion: jest.fn(),
      checkUpdate: jest.fn(),
      quitAndInstall: jest.fn()
    },
    updater: {
      check: jest.fn(),
      download: jest.fn(),
      install: jest.fn(),
      onStatus: jest.fn(() => jest.fn())
    },
    window: {
      minimize: jest.fn(),
      maximize: jest.fn(),
      close: jest.fn()
    },
    device: {
      getFingerprint: jest.fn()
    },
    db: {
      initialize: jest.fn(),
      isDegraded: jest.fn(() => false),
      close: jest.fn()
    },
    syncQueue: {
      enqueue: jest.fn(),
      getPending: jest.fn(),
      updateStatus: jest.fn(),
      exists: jest.fn()
    }
  } as unknown as ElectronAPI
}

/**
 * 将 mock electronAPI 安装到 global.window 上
 * 返回安装后的 mock 对象供测试直接操作
 */
export function installMockElectronAPI(): ElectronAPI {
  const mockAPI = createMockElectronAPI()
  ;(global as unknown as { electronAPI: unknown }).electronAPI = mockAPI
  return mockAPI
}

// ===== 测试数据生成器 =====

/**
 * 生成用户测试数据
 */
export function generateUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    phone: '13800000000',
    level: 1,
    roles: ['user'],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

/**
 * 生成 Agent 测试数据
 */
export function generateAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 1,
    name: 'test-agent',
    description: '测试 Agent',
    avatar: undefined,
    category: 'office',
    tags: ['测试'],
    rating: 4.5,
    ratingCount: 10,
    callCount: 100,
    pricePerCall: 5,
    pricePerToken: { input: 0.01, output: 0.02 },
    creatorType: 'official',
    isOfficial: true,
    ...overrides
  }
}

/**
 * 生成积分流水测试数据
 */
export function generateTransaction(
  overrides: Partial<CreditTransaction> = {}
): CreditTransaction {
  return {
    id: 1,
    type: 'consume',
    amount: -10,
    balanceBefore: 100,
    balanceAfter: 90,
    source: 'chat',
    sourceId: 'session-1',
    remark: '对话消耗',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides
  }
}

/**
 * 生成积分账户测试数据
 */
export function generateCreditAccount(
  overrides: Partial<CreditAccount> = {}
): CreditAccount {
  return {
    balance: 1000,
    frozenBalance: 0,
    totalRecharged: 2000,
    totalConsumed: 1000,
    ...overrides
  }
}

/**
 * 生成 API Key 池条目测试数据
 */
export function generateApiKeyPoolItem(
  overrides: Partial<ApiKeyPoolItem> = {}
): ApiKeyPoolItem {
  return {
    id: 1,
    alias: 'test-key',
    provider: 'openai',
    priority: 1,
    status: 'active',
    totalQuota: 100000,
    usedQuota: 0,
    remainingQuota: 100000,
    dailyQuota: 10000,
    monthlyQuota: 300000,
    errorCount: 0,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

/**
 * 生成设备测试数据（用户端）
 */
export function generateDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 1,
    deviceName: '测试设备',
    fingerprint: 'abc123def456',
    lastLoginAt: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

/**
 * 生成设备测试数据（管理端）
 */
export function generateAdminDevice(
  overrides: Partial<AdminDevice> = {}
): AdminDevice {
  return {
    id: 1,
    userId: 1,
    username: 'testuser',
    deviceName: '测试设备',
    deviceFingerprint: 'abc123def456',
    lastLoginAt: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

/**
 * 生成同步队列行测试数据
 */
export function generateSyncQueueRow(
  id: number,
  overrides: Partial<SyncQueueRow> = {}
): SyncQueueRow {
  return {
    id,
    client_txn_id: `txn-${id}`,
    entity_type: 'chat_message',
    entity_id: `msg-${id}`,
    operation: 'create',
    payload: { content: `message ${id}` },
    status: 'pending',
    retry_count: 0,
    error_message: null,
    created_at: new Date().toISOString(),
    synced_at: null,
    ...overrides
  }
}

/**
 * 生成同步队列项测试数据
 */
export function generateSyncQueueItem(
  id: number,
  overrides: Partial<SyncQueueItem> = {}
): SyncQueueItem {
  return {
    client_txn_id: `txn-${id}`,
    entity_type: 'chat_message',
    entity_id: `msg-${id}`,
    operation: 'create',
    payload: { content: `message ${id}` },
    ...overrides
  }
}

/**
 * 生成工作流执行记录测试数据
 */
export function generateWorkflowExecution(
  overrides: Partial<WorkflowExecution> = {}
): WorkflowExecution {
  return {
    id: 1,
    workflowId: 1,
    status: 'success',
    input: {},
    output: {},
    durationMs: 1000,
    creditsCost: 15,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    finishedAt: new Date('2025-01-01T00:00:01.000Z'),
    ...overrides
  }
}

/**
 * 生成 Hermes 实例测试数据
 */
export function generateHermesInstance(
  overrides: Partial<HermesInstance> = {}
): HermesInstance {
  return {
    id: 1,
    name: 'test-instance',
    status: 'running',
    skillCount: 2,
    skillIds: [1, 2],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

// ===== 常用 mock 数据 =====

/** 设备超限错误码 */
export const DEVICE_LIMIT_EXCEEDED_CODE = 1011

/** 默认 HMAC 密钥（测试用） */
export const TEST_SECRET_KEY = 'test-secret-key-for-hmac-signing'

/** 默认 accessToken（测试用） */
export const TEST_ACCESS_TOKEN = 'test-access-token-shentong-ai'

/** 默认 refreshToken（测试用） */
export const TEST_REFRESH_TOKEN = 'test-refresh-token-shentong-ai'

/** 创作者分成比例（70%） */
export const CREATOR_REVENUE_SHARE_RATE = 0.7

/** SyncService 单批最大条数 */
export const SYNC_BATCH_SIZE = 100

/** SyncService 最大重试次数 */
export const SYNC_MAX_RETRY = 3

/** HMAC 时钟漂移容忍度（秒） */
export const HMAC_MAX_SKEW_SECONDS = 300

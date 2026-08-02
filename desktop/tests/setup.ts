// 娴嬭瘯宸ュ叿鏂囦欢 - Mock 宸ュ巶鍑芥暟 + 娴嬭瘯鏁版嵁鐢熸垚鍣?+ 甯哥敤 mock 鏁版嵁
//
// 璇ユ枃浠跺湪 jest.config.ts 鐨?setupFilesAfterEnv 涓寮曠敤锛?
// 鍚屾椂涔熶綔涓烘ā鍧楀鍑轰緵鍚?e2e 娴嬭瘯鏂囦欢鎸夐渶寮曞叆銆?

import type { User } from '@/store/auth'
import type { Agent } from '@/types/agent'
import type { CreditTransaction, CreditAccount } from '@/types/credits'
import type { ApiKeyPoolItem } from '@/types/admin-api-key-pool'
import type { Device } from '@/types/settings'
import type { AdminDevice } from '@/types/admin-user'
import type { WorkflowExecution } from '@/types/workflow'
import type { HermesInstance } from '@/types/hermes'
import type { SyncQueueRow, SyncQueueItem, ElectronAPI } from '@shared/types'

// ===== Mock 宸ュ巶鍑芥暟 =====

/**
 * 鍒涘缓 HttpClient mock 瀵硅薄
 * 杩斿洖鍖呭惈 get/post/put/delete/patch 鐨?mock 鍑芥暟闆嗗悎
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
 * 鍒涘缓 Zustand store mock 瀵硅薄
 * 鎻愪緵 getState/setState/subscribe 绛夊熀纭€鏂规硶
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
 * 鍒涘缓 ElectronAPI mock 瀵硅薄
 * 瑕嗙洊 syncQueue / db / device / window / app / updater / service 绛夊懡鍚嶇┖闂?
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
      onError: jest.fn(() => jest.fn()),
      // M5 淇锛氳ˉ鍏?onInstallProgress mock
      onInstallProgress: jest.fn(() => jest.fn())
    },
    app: {
      getVersion: jest.fn(),
      checkUpdate: jest.fn(),
      quitAndInstall: jest.fn(),
      // M5 淇锛氳ˉ鍏?disableHardwareAcceleration mock
      disableHardwareAcceleration: jest.fn()
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
 * 灏?mock electronAPI 瀹夎鍒?global.window 涓?
 * 杩斿洖瀹夎鍚庣殑 mock 瀵硅薄渚涙祴璇曠洿鎺ユ搷浣?
 */
export function installMockElectronAPI(): ElectronAPI {
  const mockAPI = createMockElectronAPI()
  ;(global as unknown as { electronAPI: unknown }).electronAPI = mockAPI
  return mockAPI
}

// ===== 娴嬭瘯鏁版嵁鐢熸垚鍣?=====

/**
 * 鐢熸垚鐢ㄦ埛娴嬭瘯鏁版嵁
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
 * 鐢熸垚 Agent 娴嬭瘯鏁版嵁
 */
export function generateAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 1,
    name: 'test-agent',
    description: '娴嬭瘯 Agent',
    avatar: undefined,
    category: 'office',
    tags: ['娴嬭瘯'],
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
 * 鐢熸垚绉垎娴佹按娴嬭瘯鏁版嵁
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
    remark: '对话消息',
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides
  }
}

/**
 * 鐢熸垚绉垎璐︽埛娴嬭瘯鏁版嵁
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
 * 鐢熸垚 API Key 姹犳潯鐩祴璇曟暟鎹?
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
 * 鐢熸垚璁惧娴嬭瘯鏁版嵁锛堢敤鎴风锛?
 */
export function generateDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: 1,
    deviceName: '娴嬭瘯璁惧',
    fingerprint: 'abc123def456',
    lastLoginAt: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

/**
 * 鐢熸垚璁惧娴嬭瘯鏁版嵁锛堢鐞嗙锛?
 */
export function generateAdminDevice(
  overrides: Partial<AdminDevice> = {}
): AdminDevice {
  return {
    id: 1,
    userId: 1,
    username: 'testuser',
    deviceName: '娴嬭瘯璁惧',
    deviceFingerprint: 'abc123def456',
    lastLoginAt: '2025-01-01T00:00:00.000Z',
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides
  }
}

/**
 * 鐢熸垚鍚屾闃熷垪琛屾祴璇曟暟鎹?
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
 * 鐢熸垚鍚屾闃熷垪椤规祴璇曟暟鎹?
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
 * 鐢熸垚宸ヤ綔娴佹墽琛岃褰曟祴璇曟暟鎹?
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
 * 鐢熸垚 Hermes 瀹炰緥娴嬭瘯鏁版嵁
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

// ===== 甯哥敤 mock 鏁版嵁 =====

/** 璁惧瓒呴檺閿欒鐮?*/
export const DEVICE_LIMIT_EXCEEDED_CODE = 1011

/** 榛樿 HMAC 瀵嗛挜锛堟祴璇曠敤锛?*/
export const TEST_SECRET_KEY = 'test-secret-key-for-hmac-signing'

/** 榛樿 accessToken锛堟祴璇曠敤锛?*/
export const TEST_ACCESS_TOKEN = 'test-access-token-shentong-ai'

/** 榛樿 refreshToken锛堟祴璇曠敤锛?*/
export const TEST_REFRESH_TOKEN = 'test-refresh-token-shentong-ai'

/** 鍒涗綔鑰呭垎鎴愭瘮渚嬶紙70%锛?*/
export const CREATOR_REVENUE_SHARE_RATE = 0.7

/** SyncService 鍗曟壒鏈€澶ф潯鏁?*/
export const SYNC_BATCH_SIZE = 100

/** SyncService 鏈€澶ч噸璇曟鏁?*/
export const SYNC_MAX_RETRY = 3

/** HMAC 鏃堕挓婕傜Щ瀹瑰繊搴︼紙绉掞級 */
export const HMAC_MAX_SKEW_SECONDS = 300

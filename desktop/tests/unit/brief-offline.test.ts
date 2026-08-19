// 三期 3.3 / T5：需求单离线暂存与补传链路测试
//
// 场景：
// 1. 在线 → 云端创建成功，返回 source='cloud'
// 2. 断网（offlineQueue.isOnline=false）→ 落本地 + 入队（entity_type='brief'）
// 3. 在线但网络错误（NetworkError）→ 落本地 + 入队
// 4. 服务端 5xx（BusinessError code>=500）→ 落本地 + 入队
// 5. 业务 4xx（BusinessError code=400）→ 原样抛出，不落本地
// 6. 本地保存失败 → 抛错
import { createBriefWithOfflineFallback, isOfflineFallbackError } from '@/api/brief-offline'
import { createBrief } from '@/api/brief-api'
import { createLocalBrief } from '@/api/local-brief-api'
import { offlineQueue } from '@/api/offline-queue'
import { BusinessError, NetworkError } from '@/utils/errors'
import type { LocalBrief } from '@shared/types'

jest.mock('@/api/brief-api', () => ({
  createBrief: jest.fn(),
  listBriefs: jest.fn(),
  getBrief: jest.fn(),
  updateBrief: jest.fn(),
  confirmBrief: jest.fn(),
  cancelBrief: jest.fn(),
  getBriefHistory: jest.fn(),
  default: {},
}))

jest.mock('@/api/local-brief-api', () => ({
  createLocalBrief: jest.fn(),
  listLocalBriefs: jest.fn(),
  markLocalBriefSynced: jest.fn(),
  default: {},
}))

jest.mock('@/api/offline-queue', () => ({
  offlineQueue: {
    isOnline: jest.fn(() => true),
    enqueue: jest.fn().mockResolvedValue(undefined),
    onOnline: jest.fn(),
  },
  default: {
    isOnline: jest.fn(() => true),
    enqueue: jest.fn().mockResolvedValue(undefined),
    onOnline: jest.fn(),
  },
}))

const mockCreateBrief = createBrief as unknown as jest.Mock
const mockCreateLocalBrief = createLocalBrief as unknown as jest.Mock
const mockIsOnline = offlineQueue.isOnline as unknown as jest.Mock
const mockEnqueue = offlineQueue.enqueue as unknown as jest.Mock

const localBrief: LocalBrief = {
  id: 7,
  clientBriefId: 'lb_test_abc',
  userId: 9,
  title: '离线创建的简报',
  goal: '断网时也要能创建',
  targetAudience: '大学生',
  platforms: ['douyin'],
  style: '轻松口语化',
  deadline: '2026-09-01',
  status: 'draft',
  cloudSynced: false,
  createdAt: '2026-08-19 10:00:00',
  updatedAt: '2026-08-19 10:00:00',
}

const payload = {
  title: '离线创建的简报',
  goal: '断网时也要能创建',
  targetAudience: '大学生',
  platforms: ['douyin'],
  style: '轻松口语化',
  deadline: '2026-09-01',
}

beforeEach(() => {
  jest.clearAllMocks()
  mockIsOnline.mockReturnValue(true)
  mockCreateLocalBrief.mockResolvedValue(localBrief)
})

test('在线时云端创建成功，返回 source=cloud 且不落本地', async () => {
  mockCreateBrief.mockResolvedValue({ id: 1, title: payload.title })

  const result = await createBriefWithOfflineFallback({ userId: 9, payload })

  expect(result.source).toBe('cloud')
  expect(mockCreateBrief).toHaveBeenCalledWith(payload)
  expect(mockCreateLocalBrief).not.toHaveBeenCalled()
  expect(mockEnqueue).not.toHaveBeenCalled()
})

test('断网时落本地并写入同步队列（entity_type=brief）', async () => {
  mockIsOnline.mockReturnValue(false)

  const result = await createBriefWithOfflineFallback({ userId: 9, payload })

  expect(result.source).toBe('local')
  expect(mockCreateBrief).not.toHaveBeenCalled()
  expect(mockCreateLocalBrief).toHaveBeenCalledWith({
    userId: 9,
    title: payload.title,
    goal: payload.goal,
    targetAudience: payload.targetAudience,
    platforms: payload.platforms,
    style: payload.style,
    deadline: payload.deadline,
    sourceChatSessionId: null,
    sourceChatSummary: null,
  })
  expect(mockEnqueue).toHaveBeenCalledWith({
    client_txn_id: `local-brief-${localBrief.clientBriefId}`,
    entity_type: 'brief',
    entity_id: localBrief.clientBriefId,
    operation: 'create',
    payload,
  })
})

test('在线但网络错误（NetworkError）时回退本地 + 入队', async () => {
  mockCreateBrief.mockRejectedValue(new NetworkError('网络连接失败'))

  const result = await createBriefWithOfflineFallback({ userId: 9, payload })

  expect(result.source).toBe('local')
  expect(mockEnqueue).toHaveBeenCalledTimes(1)
})

test('服务端 5xx 时回退本地 + 入队', async () => {
  mockCreateBrief.mockRejectedValue(new BusinessError(500, '服务器错误'))

  const result = await createBriefWithOfflineFallback({ userId: 9, payload })

  expect(result.source).toBe('local')
  expect(mockEnqueue).toHaveBeenCalledTimes(1)
})

test('业务 4xx 原样抛出，不落本地', async () => {
  mockCreateBrief.mockRejectedValue(new BusinessError(400, '标题过长'))

  await expect(createBriefWithOfflineFallback({ userId: 9, payload })).rejects.toThrow('标题过长')
  expect(mockCreateLocalBrief).not.toHaveBeenCalled()
  expect(mockEnqueue).not.toHaveBeenCalled()
})

test('本地保存失败时抛错，不写入队列', async () => {
  mockIsOnline.mockReturnValue(false)
  mockCreateLocalBrief.mockResolvedValue(null)

  await expect(createBriefWithOfflineFallback({ userId: 9, payload })).rejects.toThrow('本地保存失败')
  expect(mockEnqueue).not.toHaveBeenCalled()
})

test('isOfflineFallbackError 判定：NetworkError/5xx 为真，4xx 为假', () => {
  expect(isOfflineFallbackError(new NetworkError('x'))).toBe(true)
  expect(isOfflineFallbackError(new BusinessError(500, 'x'))).toBe(true)
  expect(isOfflineFallbackError(new BusinessError(400, 'x'))).toBe(false)
  expect(isOfflineFallbackError(new Error('x'))).toBe(false)
})

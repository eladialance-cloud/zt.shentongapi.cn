import { listLocalBriefs, createLocalBrief, updateLocalBrief, removeLocalBrief, markLocalBriefSynced } from '@/api/local-brief-api'
import type { ElectronAPI, LocalBrief } from '@shared/types'

const brief: LocalBrief = {
  id: 1,
  clientBriefId: 'lb_1',
  userId: 9,
  title: '小红书内容',
  goal: '一篇一人公司文章',
  platforms: ['xiaohongshu'],
  status: 'draft',
  cloudSynced: false,
  createdAt: '2026-08-19 10:00:00',
  updatedAt: '2026-08-19 10:00:00',
}

beforeEach(() => {
  window.electronAPI = {
    db: {
      initialize: jest.fn(),
      isDegraded: () => false,
      close: jest.fn(),
      briefs: {
        list: jest.fn().mockResolvedValue([brief]),
        create: jest.fn().mockResolvedValue(brief),
        update: jest.fn().mockResolvedValue(brief),
        remove: jest.fn().mockResolvedValue(undefined),
        markSynced: jest.fn().mockResolvedValue(undefined),
      },
    },
  } as unknown as ElectronAPI
})

test('listLocalBriefs 返回本地需求单', async () => {
  await expect(listLocalBriefs()).resolves.toEqual([brief])
})

test('createLocalBrief 透传输入', async () => {
  const input = { userId: 9, title: '小红书内容', platforms: ['xiaohongshu'] }
  await expect(createLocalBrief(input)).resolves.toEqual(brief)
})

test('updateLocalBrief 透传 id+patch', async () => {
  await updateLocalBrief(1, { status: 'confirmed' })
  expect(window.electronAPI.db.briefs.update).toHaveBeenCalledWith(1, { status: 'confirmed' })
})

test('removeLocalBrief 透传 id', async () => {
  await removeLocalBrief(1)
  expect(window.electronAPI.db.briefs.remove).toHaveBeenCalledWith(1)
})

test('markLocalBriefSynced 按 clientBriefId 透传', async () => {
  await markLocalBriefSynced('lb_1')
  expect(window.electronAPI.db.briefs.markSynced).toHaveBeenCalledWith('lb_1')
})

test('electronAPI 缺失时安全降级', async () => {
  window.electronAPI = undefined as unknown as ElectronAPI
  await expect(listLocalBriefs()).resolves.toEqual([])
  await expect(createLocalBrief({ userId: 1, title: 't' })).resolves.toBeNull()
})

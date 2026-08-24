// 口播工坊桌面端单元测试（M6-5）
// 覆盖：store 草稿/缓存、API 模块导出契约、页面纯函数（状态映射/时间格式化/步骤标签）
import {
  STEP_LABELS,
  statusText,
  stepStatusToAntd,
} from '@/pages/OralWorkshop/Detail'
import { STATUS_META, formatTime } from '@/pages/OralWorkshop/Projects'
import { useOralWorkshopStore } from '@/store/oral-workshop'
import * as api from '@/api/oral-workshop-api'

jest.mock('@/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    getInstance: jest.fn(),
  },
}))

// media.ts 使用 import.meta.env（Vite 专有），Jest CJS 下需 mock
jest.mock('@/utils/media', () => ({
  resolveMediaUrl: (url: string) => url,
  default: { resolveMediaUrl: (url: string) => url },
}))

describe('OralWorkshop 页面纯函数', () => {
  it('STEP_LABELS 覆盖 7 步', () => {
    expect(Object.keys(STEP_LABELS)).toHaveLength(7)
    expect(STEP_LABELS.extract).toBe('文案抽取')
    expect(STEP_LABELS.publishReady).toBe('发布就绪')
  })

  it('stepStatusToAntd 状态映射', () => {
    expect(stepStatusToAntd('done')).toBe('finish')
    expect(stepStatusToAntd('running')).toBe('process')
    expect(stepStatusToAntd('failed')).toBe('error')
    expect(stepStatusToAntd('pending')).toBe('wait')
  })

  it('statusText 中文状态文案', () => {
    expect(statusText('processing')).toBe('生成中')
    expect(statusText('done')).toBe('已完成')
    expect(statusText('unknown')).toBe('unknown')
  })

  it('STATUS_META 覆盖全部任务状态', () => {
    expect(Object.keys(STATUS_META).sort()).toEqual(['cancelled', 'done', 'failed', 'pending', 'processing'].sort())
    expect(STATUS_META.done.label).toBe('已完成')
  })

  it('formatTime 非法输入兜底', () => {
    expect(formatTime('')).toBe('--')
    expect(formatTime('not-a-date')).toBe('not-a-date')
    expect(formatTime('2026-08-24T10:00:00Z')).toContain('2026')
  })
})

describe('OralWorkshop store', () => {
  beforeEach(() => {
    useOralWorkshopStore.getState().clearDraft()
    useOralWorkshopStore.getState().setLastJob(null)
  })

  it('setDraft 合并草稿字段', () => {
    useOralWorkshopStore.getState().setDraft({ scriptInput: '你好世界' })
    expect(useOralWorkshopStore.getState().draft.scriptInput).toBe('你好世界')
    useOralWorkshopStore.getState().setDraft({ persona: '专家' })
    const d = useOralWorkshopStore.getState().draft
    expect(d.scriptInput).toBe('你好世界')
    expect(d.persona).toBe('专家')
  })

  it('clearDraft 重置为初始值', () => {
    useOralWorkshopStore.getState().setDraft({ scriptInput: 'x', templateId: 2 })
    useOralWorkshopStore.getState().clearDraft()
    expect(useOralWorkshopStore.getState().draft).toEqual({
      scriptInput: '',
      goal: '',
      targetAudience: '',
      style: '',
      persona: '',
      templateId: null,
    })
  })

  it('setLastJob 缓存最近任务', () => {
    const job = { id: 1, status: 'processing' } as never
    useOralWorkshopStore.getState().setLastJob(job)
    expect(useOralWorkshopStore.getState().lastJob).toBe(job)
  })
})

describe('OralWorkshop API 契约', () => {
  it('导出全部端点函数', () => {
    expect(typeof api.createOralWorkshopJob).toBe('function')
    expect(typeof api.batchCreateOralWorkshopJobs).toBe('function')
    expect(typeof api.listOralWorkshopJobs).toBe('function')
    expect(typeof api.getOralWorkshopJob).toBe('function')
    expect(typeof api.cancelOralWorkshopJob).toBe('function')
    expect(typeof api.exportOralWorkshopPackage).toBe('function')
    expect(typeof api.listOralWorkshopTemplates).toBe('function')
    expect(typeof api.generateTopics).toBe('function')
    expect(typeof api.listMyVoices).toBe('function')
    expect(typeof api.listMyDigitalHumans).toBe('function')
  })

  it('预估 Credits 与后端一致（21）', () => {
    expect(api.ORAL_WORKSHOP_ESTIMATED_CREDITS).toBe(21)
  })
})

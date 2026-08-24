// 口播工坊 store — 草稿（localStorage）+ 最近任务进度缓存
// 设计依据：方案 §5.2（无新本地表，草稿本地存储，进度从后端拉取）
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { OralWorkshopJob } from '@/types/oral-workshop'

/** 工作台草稿（自动保存到 localStorage） */
export interface OralWorkshopDraft {
  scriptInput: string
  goal: string
  targetAudience: string
  style: string
  persona: string
  templateId: number | null
}

interface OralWorkshopState {
  draft: OralWorkshopDraft
  /** 最近查看的任务（详情页缓存，便于列表返回时即时展示） */
  lastJob: OralWorkshopJob | null
  setDraft: (partial: Partial<OralWorkshopDraft>) => void
  clearDraft: () => void
  setLastJob: (job: OralWorkshopJob | null) => void
}

const INITIAL_DRAFT: OralWorkshopDraft = {
  scriptInput: '',
  goal: '',
  targetAudience: '',
  style: '',
  persona: '',
  templateId: null,
}

export const useOralWorkshopStore = create<OralWorkshopState>()(
  persist(
    (set) => ({
      draft: INITIAL_DRAFT,
      lastJob: null,
      setDraft: (partial) => set((s) => ({ draft: { ...s.draft, ...partial } })),
      clearDraft: () => set({ draft: INITIAL_DRAFT }),
      setLastJob: (job) => set({ lastJob: job }),
    }),
    {
      name: 'oral-workshop-draft',
      // 只持久化草稿字段（任务进度始终从后端拉取，不缓存为权威）
      partialize: (state) => ({ draft: state.draft }),
    }
  )
)

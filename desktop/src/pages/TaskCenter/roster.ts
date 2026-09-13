/**
 * 官署「编制」读取（渲染层）
 *
 * 编制 = 最近一次「一键组队」选择的套餐，主进程落盘在 <userData>/edict-roster.json。
 * 任务中心/办公室按它过滤展示：编制外的官署不再假装「空闲在职」。
 *
 * 回退：读不到（旧主进程 / 浏览器调试）⇒ 视为全集，行为与升级前一致。
 */
import { useEffect, useState } from 'react'

/** 官署全集（与主进程 team-preset.ALL_OFFICIALS 同口径，仅作回退） */
export const ALL_OFFICIAL_IDS: readonly string[] = [
  'taizi', 'zhongshu', 'menxia', 'shangshu', 'libu', 'hubu',
  'libu_hr', 'bingbu', 'xingbu', 'gongbu', 'zaochao', 'qintianjian',
]

export interface EdictRosterState {
  /** 当前编制对应套餐（null=未落盘，按全集处理） */
  presetId: string | null
  /** 编制内官署 id */
  officials: string[]
  /** 磁盘上已装的官署（profiles 目录） */
  installed: string[]
  /** 是否用的是「无记录⇒全集」的兜底 */
  isDefault: boolean
  /** 是否已尝试加载（避免重复请求） */
  loaded: boolean
}

const DEFAULT_STATE: EdictRosterState = {
  presetId: null,
  officials: [...ALL_OFFICIAL_IDS],
  installed: [],
  isDefault: true,
  loaded: false,
}

let state: EdictRosterState = DEFAULT_STATE
const listeners = new Set<(s: EdictRosterState) => void>()
let inflight: Promise<EdictRosterState> | null = null

function emit(): void {
  for (const l of listeners) l(state)
}

interface RosterApi {
  currentRoster?: () => Promise<{
    ok: boolean
    presetId: string | null
    officials: string[]
    installed: string[]
    isDefault: boolean
  }>
}

function teamApi(): RosterApi | undefined {
  const api = (window as unknown as { electronAPI?: { team?: RosterApi } }).electronAPI
  return api?.team
}

/** 当前编制（同步快照；未加载完为全集） */
export function getEdictRoster(): EdictRosterState {
  return state
}

/** 在编判断（编制为空视为全部在编，兼容旧行为） */
export function isInRoster(id: string, officials: readonly string[] = state.officials): boolean {
  return officials.length === 0 || officials.includes(id)
}

/** 拉一次编制；多组件共享同一次请求 */
export function ensureEdictRoster(): Promise<EdictRosterState> {
  if (state.loaded) return Promise.resolve(state)
  if (inflight) return inflight
  const api = teamApi()
  if (!api?.currentRoster) {
    state = { ...state, loaded: true }
    emit()
    return Promise.resolve(state)
  }
  inflight = api
    .currentRoster()
    .then((r) => {
      const officials = Array.isArray(r?.officials) && r.officials.length ? r.officials : [...ALL_OFFICIAL_IDS]
      state = {
        presetId: r?.presetId ?? null,
        officials,
        installed: Array.isArray(r?.installed) ? r.installed : [],
        isDefault: r?.isDefault ?? !r?.presetId,
        loaded: true,
      }
      emit()
      return state
    })
    .catch(() => {
      state = { ...state, loaded: true }
      emit()
      return state
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/** 强制刷新（换套餐后调用） */
export function refreshEdictRoster(): Promise<EdictRosterState> {
  state = { ...state, loaded: false }
  return ensureEdictRoster()
}

/** 订阅编制变化 */
export function useEdictRoster(): EdictRosterState {
  const [snap, setSnap] = useState<EdictRosterState>(state)
  useEffect(() => {
    listeners.add(setSnap)
    setSnap(state)
    void ensureEdictRoster()
    return () => {
      listeners.delete(setSnap)
    }
  }, [])
  return snap
}
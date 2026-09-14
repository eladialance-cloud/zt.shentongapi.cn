// 口播工坊 → 任务工作台：混剪建议「加入画中画」的本地中转
//
// 为什么用 localStorage：混剪建议在「口播工坊·素材与混剪」生成，画中画在「任务工作台」使用，
// 两者跨页面、跨任务，且建议属于"待用草稿"，不必落服务端。这里做唯一读写口径
// （字段校验 / 同条去重 / 条数上限 / 脏数据容错），修掉原来"只写不读"的死联动。
import type { PipAssetInput } from '@/types/oral-workshop'

/** 存储 key（沿用历史 key，兼容已写入的本地数据） */
export const PIP_SUGGESTIONS_KEY = 'oral-workshop-pip-suggestions'

/** 最多保留的条数（超出丢弃最旧的） */
export const PIP_SUGGESTIONS_LIMIT = 20

export type PipPosition = 'tl' | 'tr' | 'bl' | 'br' | 'center'

/** 一条待用画中画建议 */
export interface PipSuggestion extends PipAssetInput {
  /** 对应字幕（人工核对用） */
  subtitle: string
  /** 匹配关键词 */
  keyword?: string
  /** 素材名（展示用） */
  name?: string
  /** 素材物理类型（video/image） */
  type?: string
  /** 来源任务 id */
  jobId?: number
  /** 写入时间（ISO） */
  addedAt: string
}

/** 最小 Storage 接口（便于单测注入 fake；浏览器传 localStorage） */
export interface PipStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const POSITIONS: PipPosition[] = ['tl', 'tr', 'bl', 'br', 'center']
export const DEFAULT_PIP_POSITION: PipPosition = 'tr'
export const DEFAULT_PIP_SCALE = 0.25

/** 解析存储对象：显式传入优先，其次浏览器 localStorage，都没有（SSR/测试）返回 null */
function resolveStorage(storage?: PipStorage): PipStorage | null {
  if (storage) return storage
  const g = globalThis as { localStorage?: PipStorage }
  return g.localStorage ?? null
}

/** 归一化位置（非法值回落默认） */
export function normalizePipPosition(value: unknown): PipPosition {
  return POSITIONS.includes(value as PipPosition) ? (value as PipPosition) : DEFAULT_PIP_POSITION
}

/** 归一化大小（钳制到 0.05~1；非法值回落默认） */
export function normalizePipScale(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PIP_SCALE
  return Math.min(1, Math.max(0.05, n))
}

/** 容错解析（历史/脏数据不抛错：非法条目直接丢弃） */
export function parsePipSuggestions(raw: string | null): PipSuggestion[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const list: PipSuggestion[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const url = typeof r.url === 'string' ? r.url.trim() : ''
    if (!url) continue
    const startSec = Number(r.startSec)
    const endSec = Number(r.endSec)
    const jobId = Number(r.jobId)
    list.push({
      url,
      position: normalizePipPosition(r.position),
      scale: normalizePipScale(r.scale),
      startSec: Number.isFinite(startSec) ? startSec : undefined,
      endSec: Number.isFinite(endSec) ? endSec : undefined,
      subtitle: typeof r.subtitle === 'string' ? r.subtitle : '',
      keyword: typeof r.keyword === 'string' ? r.keyword : undefined,
      name: typeof r.name === 'string' ? r.name : undefined,
      type: typeof r.type === 'string' ? r.type : undefined,
      jobId: Number.isFinite(jobId) && jobId > 0 ? jobId : undefined,
      addedAt: typeof r.addedAt === 'string' ? r.addedAt : '',
    })
  }
  return list
}

/** 读取全部建议（无可用存储时返回空数组） */
export function readPipSuggestions(storage?: PipStorage): PipSuggestion[] {
  const s = resolveStorage(storage)
  if (!s) return []
  try {
    return parsePipSuggestions(s.getItem(PIP_SUGGESTIONS_KEY))
  } catch {
    return []
  }
}

/** 写回（存储不可用——隐私模式/配额满——静默降级，不影响页面逻辑） */
function writePipSuggestions(list: PipSuggestion[], storage?: PipStorage): PipSuggestion[] {
  const s = resolveStorage(storage)
  if (s) {
    try {
      s.setItem(PIP_SUGGESTIONS_KEY, JSON.stringify(list))
    } catch {
      /* ignore */
    }
  }
  return list
}

/** 追加一条建议（url + 字幕相同视为同一条 → 覆盖去重；超出上限丢最旧） */
export function addPipSuggestion(entry: PipSuggestion, storage?: PipStorage): PipSuggestion[] {
  const rest = readPipSuggestions(storage).filter(
    (it) => !(it.url === entry.url && it.subtitle === entry.subtitle),
  )
  return writePipSuggestions([...rest, entry].slice(-PIP_SUGGESTIONS_LIMIT), storage)
}

/** 按索引移除一条 */
export function removePipSuggestion(index: number, storage?: PipStorage): PipSuggestion[] {
  return writePipSuggestions(
    readPipSuggestions(storage).filter((_, i) => i !== index),
    storage,
  )
}

/** 按索引批量移除（「全部加入」一次消费多条） */
export function removePipSuggestions(indices: number[], storage?: PipStorage): PipSuggestion[] {
  const drop = new Set(indices)
  return writePipSuggestions(
    readPipSuggestions(storage).filter((_, i) => !drop.has(i)),
    storage,
  )
}

/** 清空 */
export function clearPipSuggestions(storage?: PipStorage): PipSuggestion[] {
  return writePipSuggestions([], storage)
}

/** 由混剪建议条目构造待用画中画建议（无匹配素材时返回 null） */
export function toPipSuggestion(input: {
  subtitle: string
  keyword?: string
  matched?: { url?: string; name?: string; type?: string }
  pip?: { position?: string; scale?: number }
  jobId?: number
}): PipSuggestion | null {
  const url = input.matched?.url?.trim()
  if (!url) return null
  return {
    url,
    position: normalizePipPosition(input.pip?.position),
    scale: normalizePipScale(input.pip?.scale),
    subtitle: input.subtitle ?? '',
    keyword: input.keyword,
    name: input.matched?.name,
    type: input.matched?.type,
    jobId: input.jobId,
    addedAt: new Date().toISOString(),
  }
}

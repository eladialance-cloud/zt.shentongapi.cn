/**
 * 官署「编制」持久化（edict-roster）
 *
 * 一键组队选择的套餐 = 这台机器的官署编制，落盘在 <userData>/edict-roster.json。
 *
 * 背景：早先的实现只把选择结果放在内存（team-ipc 的模块级 lastResult），App 退出即丢失，
 * 于是「启动引导」无从知道该补齐哪几个官署，只能无脑补全全集 —— 套餐选择因此形同虚设。
 *
 * 约定：
 *  - 没有落盘记录 ⇒ 回退全集（兼容老用户，行为与升级前一致）
 *  - 只认已知官署 id，顺序按全集顺序规范化（保证 UI 展示顺序稳定）
 *  - 原子写：先写 .tmp 再 rename，避免半截文件
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { ALL_OFFICIALS } from './team-preset'

/** 官署全集（与 team-preset.ALL_OFFICIALS 同源，避免两处漂移） */
export const ALL_EDICT_OFFICIALS: readonly string[] = ALL_OFFICIALS

export interface EdictRoster {
  /** 最近一次一键组队选择的套餐 id（可能为 null：历史数据/手工配置） */
  presetId: string | null
  /** 编制内官署 id（已规范化） */
  officials: string[]
  /** ISO 时间 */
  updatedAt: string
}

const ROSTER_FILE = 'edict-roster.json'

export function getRosterPath(userDataDir: string): string {
  return path.join(userDataDir, ROSTER_FILE)
}

/** 规范化：只保留已知官署、去重、按全集顺序排列 */
export function normalizeOfficials(ids: readonly string[]): string[] {
  const wanted = new Set(ids)
  return ALL_EDICT_OFFICIALS.filter((id) => wanted.has(id))
}

/** 读编制；文件缺失/损坏/编制为空一律返回 null（由调用方回退全集） */
export function readRoster(userDataDir: string): EdictRoster | null {
  try {
    const raw = fs.readFileSync(getRosterPath(userDataDir), 'utf-8')
    const parsed = JSON.parse(raw) as { presetId?: unknown; officials?: unknown; updatedAt?: unknown }
    const officials = Array.isArray(parsed.officials)
      ? normalizeOfficials(parsed.officials.filter((x): x is string => typeof x === 'string'))
      : []
    if (officials.length === 0) return null
    return {
      presetId: typeof parsed.presetId === 'string' && parsed.presetId ? parsed.presetId : null,
      officials,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    }
  } catch {
    return null
  }
}

/** 写编制（原子写）；返回落盘内容 */
export function writeRoster(
  userDataDir: string,
  presetId: string | null,
  officials: readonly string[],
): EdictRoster {
  const record: EdictRoster = {
    presetId: presetId || null,
    officials: normalizeOfficials(officials),
    updatedAt: new Date().toISOString(),
  }
  const target = getRosterPath(userDataDir)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = target + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf-8')
  fs.renameSync(tmp, target)
  return record
}

/** 当前编制官署 id 列表；无记录 ⇒ 全集（兼容老用户） */
export function resolveRoster(userDataDir: string): string[] {
  const stored = readRoster(userDataDir)
  return stored ? stored.officials : [...ALL_EDICT_OFFICIALS]
}

/** 是否在编制内；未提供编制（undefined/空）时视为全部在编 */
export function isInRoster(id: string, roster?: readonly string[] | null): boolean {
  if (!roster || roster.length === 0) return true
  return roster.includes(id)
}

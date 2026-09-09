import type { PatchFile, ServiceRow, ServiceRowPatch } from './types'
import { normalizeRow, validatePatchFile, parseDependencySpec, versionSatisfies } from './types'

type Source = 'base' | 'module'
interface Entry {
  patch: ServiceRowPatch
  source: Source
}

/**
 * 装配：先 base 后 modules。
 * - insert：新增行；id 已存在则抛错（要求改用 override）。
 * - override：整块替换既有行（不 merge，抄 dsh）；目标缺失抛错；disabled 剔除目标行。
 * - 禁止 module→module 覆盖（只允许 module→base 一层）。
 * 返回按 dependsOn 稳定拓扑排序的行表：依赖前置，无依赖保持插入序。
 */
export function assembleRows(base: PatchFile, modules: PatchFile[]): ServiceRow[] {
  validatePatchFile(base, 'base.patch')
  for (const m of modules) validatePatchFile(m, 'module.patch')

  const entries: Entry[] = []
  const indexById = new Map<string, number>()
  applyPatch(entries, indexById, base, 'base')
  for (const mod of modules) applyPatch(entries, indexById, mod, 'module')

  const rows = entries.map((entry) => normalizeRow(entry.patch))
  assertDependencies(rows)
  return stableTopoSort(rows)
}

function applyPatch(
  entries: Entry[],
  indexById: Map<string, number>,
  patch: PatchFile,
  source: Source,
): void {
  for (const p of patch.insert ?? []) {
    const id = p.id.trim()
    if (p.disabled) continue
    if (indexById.has(id)) {
      throw new Error(`insert 重复服务行 id=${id}（已存在，请用 override）`)
    }
    indexById.set(id, entries.length)
    entries.push({ patch: p, source })
  }

  for (const ov of patch.override ?? []) {
    const id = ov.id.trim()
    const idx = indexById.get(id)
    if (idx === undefined) {
      throw new Error(`override 目标不存在 id=${id}`)
    }
    if (entries[idx].source === 'module' && source === 'module') {
      throw new Error(`禁止 module→module 覆盖（id=${id}）`)
    }
    if (ov.disabled) {
      entries.splice(idx, 1)
      reindex(entries, indexById)
      continue
    }
    entries[idx] = { patch: ov, source }
  }
}

function reindex(entries: Entry[], indexById: Map<string, number>): void {
  indexById.clear()
  entries.forEach((entry, i) => indexById.set(entry.patch.id.trim(), i))
}

/** 依赖校验：每个 dependsOn 必须存在；带 @range 时校验目标行 version 命中范围。 */
function assertDependencies(rows: ServiceRow[]): void {
  const byId = new Map(rows.map((r) => [r.id, r]))
  for (const r of rows) {
    for (const rawDep of r.dependsOn) {
      const dep = parseDependencySpec(rawDep)
      const target = byId.get(dep.id)
      if (dep.id !== r.id && !target) {
        throw new Error(`服务行 ${r.id} 依赖不存在的服务 ${dep.id}`)
      }
      if (dep.range) {
        if (!target) {
          // 依赖不存在但带了范围：即使存在也无法校验，仍需先报“依赖不存在”
          throw new Error(`服务行 ${r.id} 依赖不存在的服务 ${dep.id}`)
        }
        const ver = target.version || ''
        if (!ver) {
          throw new Error(`服务行 ${r.id} 依赖 ${dep.id}@${dep.range}，但目标行未声明 version，无法校验`)
        }
        if (!versionSatisfies(ver, dep.range)) {
          throw new Error(`服务行 ${r.id} 依赖 ${dep.id}@${dep.range}，目标版本 ${ver} 不满足`)
        }
      }
    }
  }
}

/** Kahn 稳定拓扑排序：依赖前置；同时就绪时按插入序，避免“模块名决定启动序”。 */
function stableTopoSort(rows: ServiceRow[]): ServiceRow[] {
  const result: ServiceRow[] = []
  const remaining = [...rows]
  const done = new Set<string>()
  while (remaining.length > 0) {
    const idx = remaining.findIndex((r) => r.dependsOn.every((rawDep) => done.has(parseDependencySpec(rawDep).id)))
    if (idx === -1) throw new Error('服务行存在循环依赖（dependsOn 环）')
    const [row] = remaining.splice(idx, 1)
    result.push(row)
    done.add(row.id)
  }
  return result
}
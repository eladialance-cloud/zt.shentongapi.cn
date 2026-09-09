/**
 * 模块启用状态持久化（纯函数，不 import electron，便于单测）。
 * 状态文件：<userData>/service-registry/module-state.json
 * 语义：disabled 列表 = 被用户停用的模块 id（模块 id 与 modules/<id>/ 目录名一致）。
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

export interface ModuleState {
  disabled: string[]
}

export function moduleStatePath(userDataDir: string): string {
  return path.join(userDataDir, 'service-registry', 'module-state.json')
}

export function readModuleState(userDataDir: string): ModuleState {
  try {
    const raw = fs.readFileSync(moduleStatePath(userDataDir), 'utf-8')
    const data = JSON.parse(raw) as Partial<ModuleState>
    if (data && Array.isArray(data.disabled)) {
      return { disabled: data.disabled.filter((x): x is string => typeof x === 'string') }
    }
  } catch {
    // 文件不存在或损坏：按空状态处理
  }
  return { disabled: [] }
}

export function writeModuleState(userDataDir: string, state: ModuleState): void {
  fs.mkdirSync(path.dirname(moduleStatePath(userDataDir)), { recursive: true })
  fs.writeFileSync(moduleStatePath(userDataDir), JSON.stringify(state, null, 2), 'utf-8')
}

/** 设置某模块启用/停用；返回更新后的状态。幂等。 */
export function setModuleDisabled(userDataDir: string, id: string, disabled: boolean): ModuleState {
  const state = readModuleState(userDataDir)
  const set = new Set(state.disabled)
  if (disabled) set.add(id)
  else set.delete(id)
  const next: ModuleState = { disabled: [...set].sort() }
  writeModuleState(userDataDir, next)
  return next
}

/** 读取当前停用模块集合（供装配过滤） */
export function disabledModuleSet(userDataDir: string): ReadonlySet<string> {
  return new Set(readModuleState(userDataDir).disabled)
}
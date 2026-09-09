/**
 * 模块包（module.yaml）解析与内容目录定位（A5 三形态 / B1 装 Hermes 渠道）。
 * 纯逻辑，不 import electron / 运行时模块，保证可单测。
 *
 * 包结构（下载/解压后消费方）：
 *   modules/<id>/
 *     module.yaml        # id / displayName / name / kind / version / target
 *     skill/SKILL.md     # skill 型内容（写入 hermes-home/skills/<id>）
 *     agent/agent.json   # agent 型内容（写入 hermes-home/agents/<id>）
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { load } from 'js-yaml'
import type { ModuleKind } from './types'

export interface ModuleMeta {
  id: string
  displayName?: string
  name?: string
  kind: ModuleKind
  version?: string
  target?: string
}

/** 解析 module.yaml 文本 → ModuleMeta；缺 id / kind 非法抛错。 */
export function parseModuleYaml(text: string): ModuleMeta {
  const data = load(text) as Record<string, unknown> | null
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('module.yaml 结构非法')
  }
  const kind = String(data.kind || 'service').trim().toLowerCase()
  if (!['service', 'skill', 'agent'].includes(kind)) {
    throw new Error('module.yaml kind 非法: ' + kind)
  }
  const id = String(data.id || '').trim()
  if (!id) throw new Error('module.yaml 缺少 id')
  return {
    id,
    displayName: data.displayName as string | undefined,
    name: data.name as string | undefined,
    kind: kind as ModuleKind,
    version: data.version as string | undefined,
    target: data.target as string | undefined,
  }
}

/** 定位模块根目录：优先 subpath；否则根或浅层含 module.yaml 的目录。 */
export function findModuleRoot(root: string, subpath?: string): string {
  if (subpath) {
    const p = path.join(root, subpath)
    if (!fs.existsSync(p)) throw new Error('模块子路径不存在: ' + subpath)
    return p
  }
  if (fs.existsSync(path.join(root, 'module.yaml'))) return root
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (d.isDirectory() && fs.existsSync(path.join(root, d.name, 'module.yaml'))) {
      return path.join(root, d.name)
    }
  }
  throw new Error('未找到 module.yaml')
}

/** 定位模块内容目录：skill 优先 <root>/skill，agent 优先 <root>/agent；否则回退到含标志文件的根。 */
export function findContentDir(moduleRoot: string, kind: ModuleKind): string {
  const rel = kind === 'skill' ? 'skill' : kind === 'agent' ? 'agent' : ''
  if (rel) {
    const sub = path.join(moduleRoot, rel)
    if (fs.existsSync(sub) && fs.readdirSync(sub).length > 0) return sub
  }
  const marker = kind === 'skill' ? 'SKILL.md' : kind === 'agent' ? 'agent.json' : ''
  if (marker && fs.existsSync(path.join(moduleRoot, marker))) return moduleRoot
  throw new Error('模块内容目录缺少 ' + (marker || '内容文件'))
}
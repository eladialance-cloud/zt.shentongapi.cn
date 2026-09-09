import * as fs from 'node:fs'
import * as path from 'node:path'
import { app } from 'electron'
import { load } from 'js-yaml'
import type { ModuleDescriptor, PatchFile, ServiceRow } from './types'
import { assembleRows } from './assembler'

/**
 * 读取服务行清单：资产放在 resources/service-registry（随 electron-builder extraResources 分发），
 * dev 环境从 desktop/resources/service-registry 读取，打包后从 process.resourcesPath 读取——
 * 与 resources/hermes 的既有解析模式保持一致。
 */
function assetsRoot(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'service-registry')
    : path.join(process.cwd(), 'resources', 'service-registry')
}

export function resolveRegistryDir(): string {
  return assetsRoot()
}

function parsePatchFile(file: string): PatchFile {
  const raw = fs.readFileSync(file, 'utf-8')
  const data = load(raw) as PatchFile
  if (!data || typeof data !== 'object') {
    throw new Error('patch 结构非法: ' + file)
  }
  const hasInsert = Array.isArray(data.insert)
  const hasOverride = Array.isArray(data.override)
  const kind = (data as PatchFile).kind ?? 'service'
  // service 型必须声明 insert/override；skill/agent 型允许只声明 kind（内容走 module.yaml/内容目录）
  if (!hasInsert && !hasOverride && kind === 'service') {
    throw new Error('patch 结构非法（需含 insert 或 override 数组）: ' + file)
  }
  return data
}

export function loadBasePatch(): PatchFile {
  return parsePatchFile(path.join(assetsRoot(), 'base.patch.yaml'))
}

/** 读取模块 patch；disabledIds 中的模块目录被跳过（停用模块不进装配）。 */
export function loadModulePatches(disabledIds?: ReadonlySet<string>): PatchFile[] {
  const dir = path.join(assetsRoot(), 'modules')
  if (!fs.existsSync(dir)) return []
  const out: PatchFile[] = []
  for (const sub of fs.readdirSync(dir).sort()) {
    if (disabledIds?.has(sub)) continue
    const p = path.join(dir, sub, 'patch.yaml')
    if (fs.existsSync(p)) out.push(parsePatchFile(p))
  }
  return out
}

/** 装配入口：base + 已启用模块 → 稳定拓扑排序后的 ServiceRow[] */
export function loadAllRows(disabledIds?: ReadonlySet<string>): ServiceRow[] {
  return assembleRows(loadBasePatch(), loadModulePatches(disabledIds))
}

/** 列出 modules/ 下全部模块（含停用），供模块管理 UI 与 modules:list/dump。 */
export function listModules(disabledIds?: ReadonlySet<string>): ModuleDescriptor[] {
  const dir = path.join(assetsRoot(), 'modules')
  if (!fs.existsSync(dir)) return []
  const out: ModuleDescriptor[] = []
  for (const sub of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, sub, 'patch.yaml')
    if (!fs.existsSync(p)) continue
    const patch = parsePatchFile(p)
    const serviceIds = (patch.insert ?? []).map((r) => r.id.trim()).filter(Boolean)
    const displayName = patch.displayName || (patch.insert ?? [])[0]?.displayName || sub
    out.push({
      id: sub,
      displayName,
      kind: patch.kind ?? 'service',
      version: patch.version ?? '',
      enabled: !(disabledIds?.has(sub)),
      serviceIds,
    })
  }
  return out
}

/**
 * 汇总全部模块 patch 中声明的 MCP server name（含停用模块）。
 * 返回 enabled（应写入）与 removed（对应模块已停用、应当从 Hermes 配置移除）。
 * 供模块启用/停用/重载后做 MCP 配置闭环，避免失效 server 残留。
 */
export function listModuleMcpNames(disabledIds?: ReadonlySet<string>): {
  enabled: string[]
  removed: string[]
} {
  const dir = path.join(assetsRoot(), 'modules')
  if (!fs.existsSync(dir)) return { enabled: [], removed: [] }
  const enabled: string[] = []
  const removed: string[] = []
  for (const sub of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, sub, 'patch.yaml')
    if (!fs.existsSync(p)) continue
    const patch = parsePatchFile(p)
    const names = (patch.insert ?? [])
      .map((r) => {
        if (!r.capabilities?.mcpServer) return ''
        return (r.capabilities.mcpServer.name?.trim() || r.id).trim()
      })
      .filter((n) => Boolean(n))
    if (!names.length) continue
    if (disabledIds?.has(sub)) removed.push(...names)
    else enabled.push(...names)
  }
  return { enabled, removed }
}

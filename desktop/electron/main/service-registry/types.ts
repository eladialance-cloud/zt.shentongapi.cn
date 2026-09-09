/**
 * 服务行声明与装配（参考 deepseek-harness 清单层叠语义，见
 * docs/desktop模块化改造方案-参考deepseek-harness-2026-09-04.md §4.2/§4.4）
 * 本文件只含类型与纯校验函数，不 import electron / 运行时模块，保证可单测。
 */

export type ServiceTier = 'base' | 'module'

/** 模块形态：service（独立进程）/ skill（装到 Hermes 技能）/ agent（装到 Hermes Agent）。 */
export type ModuleKind = 'service' | 'skill' | 'agent'

/** spawn 参数预设：实现细节在 service-manager/whitelist 白名单，patch 只声明 preset */
export type LaunchKind =
  | 'default' // 直接用 runtime-resolver resolved.args（n8n 等）
  | 'hermes' // serve --port ... --skip-build
  | 'video-claw' // serve

export type RestartTrigger = 'proxyKey' | 'modelDefaults'

/** 沙箱档位（P2 起决定 spawnSandboxed 用哪种 preset；缺省 = 无沙箱，维持现状） */
export type SandboxPermission = 'read-only' | 'workspace-write' | 'danger-full-access'

export interface ServiceCapabilities {
  /** 前端 iframe/菜单入口（绝对 URL 或 http://127.0.0.1:<port> 形式） */
  webUi?: { url: string }
  /** HTTP API 口（供 N8N/前端调用） */
  httpApi?: { port: number }
  /** MCP 服务器声明（启用模块写入 Hermes config.yaml mcp_servers；停用该模块时按 name 移除） */
  mcpServer?: { name?: string; command?: string; args?: string[]; env?: Record<string, string>; url?: string }
}

/** patch 文件里的一行（声明式、无函数/无代码） */
export interface ServiceRowPatch {
  id: string
  displayName: string
  tier: ServiceTier
  /** 运行时 key（runtime manifest / resolver 用）；缺省 = id */
  runtimeKey?: string
  /** 行声明版本（semver）；供 dependsOn 的 @range 校验与模块清单展示 */
  version?: string
  /** 主探活端口；缺省从 runtime manifest 读取 */
  port?: number
  /** 额外就绪端口（如 video-claw 前端 3000），全部就绪才算 running */
  readyPorts?: number[]
  /** 就绪等待超时 ms（缺省 30000，n8n 用 90000） */
  readyTimeoutMs?: number
  launch?: LaunchKind
  envKey?: string
  preStartKey?: string
  postInstallKey?: string
  onConfigKey?: string
  /** 依赖服务 id（顺序启动 / PENDING 语义） */
  dependsOn?: string[]
  restartOn?: RestartTrigger[]
  capabilities?: ServiceCapabilities
  /** 沙箱档位：仅声明时生效；base 服务缺省不声明（保持全权限），模块可声明收紧 */
  permissions?: SandboxPermission
  /** 沙箱下允许写入的目录（workspace-write 档的允许清单；read-only 档忽略） */
  writableDirs?: string[]
  /** 行级开关：insert.disabled=true 跳过插入；override.disabled=true 剔除目标行 */
  disabled?: boolean
}

/** patch 文件：显式 insert（新增行）与 override（整块替换/停用既有行）。 */
export interface PatchFile {
  /** 模块形态；缺省 service（向后兼容）。 */
  kind?: ModuleKind
  /** 模块显示名（skill/agent 无 insert 行时使用）。 */
  displayName?: string
  /** 模块版本。 */
  version?: string
  insert?: ServiceRowPatch[]
  override?: ServiceRowPatch[]
}

/** 归一化后的服务行（装配输出，ServiceManager 唯一消费形状） */
export interface ServiceRow {
  id: string
  displayName: string
  tier: ServiceTier
  runtimeKey: string
  /** 行声明版本（semver）；缺省空串 */
  version: string
  port: number
  readyPorts: number[]
  readyTimeoutMs: number
  launch: LaunchKind
  envKey?: string
  preStartKey?: string
  postInstallKey?: string
  onConfigKey?: string
  dependsOn: string[]
  restartOn: RestartTrigger[]
  capabilities: ServiceCapabilities
  permissions?: SandboxPermission
  writableDirs: string[]
  disabled: boolean
}

const KNOWN_LAUNCH: ReadonlySet<string> = new Set(['default', 'hermes', 'video-claw'])
const KNOWN_RESTART: ReadonlySet<string> = new Set(['proxyKey', 'modelDefaults'])
const KNOWN_PERMISSIONS: ReadonlySet<string> = new Set(['read-only', 'workspace-write', 'danger-full-access'])

export function normalizeRow(p: ServiceRowPatch): ServiceRow {
  const id = (p.id || '').trim()
  if (!id) throw new Error('服务行缺少 id')
  if (!p.displayName) throw new Error(`服务行 ${id} 缺少 displayName`)
  if (!KNOWN_LAUNCH.has(p.launch ?? 'default')) {
    throw new Error(`服务行 ${id} 的 launch 非法: ${String(p.launch)}`)
  }
  for (const t of p.restartOn ?? []) {
    if (!KNOWN_RESTART.has(t)) throw new Error(`服务行 ${id} 的 restartOn 非法: ${t}`)
  }
  if (p.permissions && !KNOWN_PERMISSIONS.has(p.permissions)) {
    throw new Error(`服务行 ${id} 的 permissions 非法: ${String(p.permissions)}`)
  }
  return {
    id,
    displayName: p.displayName,
    tier: p.tier,
    runtimeKey: (p.runtimeKey || id).trim(),
    version: (p.version || '').trim(),
    port: p.port ?? 0,
    readyPorts: p.readyPorts ?? [],
    readyTimeoutMs: p.readyTimeoutMs ?? 30000,
    launch: p.launch ?? 'default',
    envKey: p.envKey,
    preStartKey: p.preStartKey,
    postInstallKey: p.postInstallKey,
    onConfigKey: p.onConfigKey,
    dependsOn: p.dependsOn ?? [],
    restartOn: p.restartOn ?? [],
    capabilities: normalizeCapabilities(p.capabilities, id),
    permissions: p.permissions,
    writableDirs: p.writableDirs ?? [],
    disabled: !!p.disabled,
  }
}

/** capabilities 归一化：mcpServer 缺名时回退到服务行 id，保证模块停用口可精确按 name 移除。 */
function normalizeCapabilities(cap: ServiceCapabilities | undefined, id: string): ServiceCapabilities {
  const raw = cap ?? {}
  if (!raw.mcpServer) return raw
  return {
    ...raw,
    mcpServer: { ...raw.mcpServer, name: raw.mcpServer.name?.trim() || id },
  }
}

/** patch 结构自检（insert/override 各自 id 唯一、禁止依赖自引用）。 */
export function validatePatchFile(file: PatchFile, source: string): void {
  const seenInsert = new Set<string>()
  for (const p of file.insert ?? []) {
    const id = requireId(p, source)
    if (seenInsert.has(id)) throw new Error(`patch ${source} insert 重复服务行 id: ${id}`)
    seenInsert.add(id)
    checkSelfDep(p, id)
  }
  const seenOverride = new Set<string>()
  for (const ov of file.override ?? []) {
    const id = requireId(ov, source)
    if (seenOverride.has(id)) throw new Error(`patch ${source} override 重复目标 id: ${id}`)
    seenOverride.add(id)
    checkSelfDep(ov, id)
  }
}

function requireId(p: ServiceRowPatch, source: string): string {
  if (!p || typeof p.id !== 'string' || !p.id.trim()) {
    throw new Error(`patch ${source} 中存在缺少 id 的行`)
  }
  return p.id.trim()
}

function checkSelfDep(p: ServiceRowPatch, id: string): void {
  for (const dep of p.dependsOn ?? []) {
    if (dep === id) throw new Error(`服务行 ${id} 依赖自身`)
  }
}
// —— 依赖版本范围（dependsOn 支持 "id" 或 "id@semverRange"） ——
// 纯函数，不依赖外部 semver 包，支持常见运算符：> >= < <= = ^ ~ x/* 与 || 并集。

/** 依赖声明：id@range。range 缺省表示任意版本。 */
export interface DependencySpec {
  id: string
  range: string
}

/** 解析 dependsOn 单条声明（"id" 或 "id@range"）。 */
export function parseDependencySpec(spec: string): DependencySpec {
  const at = spec.indexOf('@')
  if (at === -1) return { id: spec.trim(), range: '' }
  const id = spec.slice(0, at).trim()
  const range = spec.slice(at + 1).trim()
  if (!id) throw new Error('依赖声明缺少 id: ' + spec)
  if (!range) throw new Error('依赖声明缺少版本范围（@ 后不能为空）: ' + spec)
  return { id, range }
}

/** 版本比较：a>b 返回 1，a<b 返回 -1，相等返回 0；无法解析返回 null。 */
export function compareVersions(a: string, b: string): number | null {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  if (!pa || !pb) return null
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

/** 拆解 "1.2.3" → [major, minor, patch]；支持缺省位（1 → [1]）。 */
function parseVersion(v: string): number[] | null {
  const core = v.trim().split('-')[0].split('+')[0]
  const parts = core.split('.')
  if (parts.length > 3) return null
  const nums: number[] = []
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null
    nums.push(parseInt(p, 10))
  }
  return nums
}

/** 某个版本是否命中范围（"*"/空 表示任意）。 */
export function versionSatisfies(version: string, range: string): boolean {
  if (!range.trim() || range.trim() === '*') return true
  return range.split('||').some((alt) => singleRangeSatisfies(version, alt.trim()))
}

function singleRangeSatisfies(version: string, range: string): boolean {
  const ver = parseVersion(version)
  if (!ver) return false
  // 空格分隔的复合范围（如 ">=1.2.0 <2.0.0"）
  const parts = range.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return true
  return parts.every((p) => oneTermSatisfies(version, ver, p))
}

function oneTermSatisfies(version: string, ver: number[], term: string): boolean {
  let t = term.trim()
  if (!t) return true
  let op = '='
  const opMatch = t.match(/^(>=|<=|>|<|==|=|\^|~)\s*/)
  if (opMatch) {
    op = opMatch[1]
    t = t.slice(opMatch[0].length).trim()
  }
  if (!t || t === '*' || t === 'x' || t === 'X') return true

  // 拆分版本段，支持 x/* 通配；缺失段按通配处理（1 => 1.x，1.2 => 1.2.x）
  const segs = t.split('.')
  if (segs.length > 3) return false
  const parts: Array<number | null> = []
  for (const s of segs) {
    if (s === 'x' || s === 'X' || s === '*') parts.push(null)
    else if (/^\d+$/.test(s)) parts.push(parseInt(s, 10))
    else return false // 预发布/构建后缀等暂不支持，保守不满足
  }
  while (parts.length < 3) parts.push(null)
  const hasWildcard = parts.some((x) => x === null)
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  const exactTarget = major + '.' + minor + '.' + patch

  const c = (o: string, tgt: string): boolean => {
    const cc = compareVersions(version, tgt)
    if (cc === null) return false
    switch (o) {
      case '>': return cc > 0
      case '<': return cc < 0
      case '>=': return cc >= 0
      case '<=': return cc <= 0
      default: return cc === 0
    }
  }

  // 关系运算符：按精确下界比较（缺失/通配段补 0，1.2 => >=1.2.0）
  if (op === '>' || op === '>=' || op === '<' || op === '<=') {
    return c(op, exactTarget)
  }

  if (op === '^') {
    // ^1.2.3 => >=1.2.3 <2.0.0；^0.2.3 => >=0.2.3 <0.3.0；^0.0.3 => >=0.0.3 <0.0.4
    if (c('<', exactTarget)) return false
    if (major > 0) return c('<', (major + 1) + '.0.0')
    if (minor > 0) return c('<', '0.' + (minor + 1) + '.0')
    return c('<', '0.0.' + (patch + 1))
  }
  if (op === '~') {
    // ~1.2.3 => >=1.2.3 <1.3.0；~1 => >=1.0.0 <2.0.0
    if (c('<', exactTarget)) return false
    if (parts[1] === null) return c('<', (major + 1) + '.0.0')
    return c('<', major + '.' + (minor + 1) + '.0')
  }

  // 默认精确/通配（= 或 ==）
  if (hasWildcard) {
    if (parts[1] === null) {
      return c('>=', major + '.0.0') && c('<', (major + 1) + '.0.0')
    }
    return c('>=', major + '.' + minor + '.0') && c('<', major + '.' + (minor + 1) + '.0')
  }
  return c('=', exactTarget)
}

/** 模块目录描述（modules/<id>/patch.yaml 的清单项，供 modules:list/dump 与模块管理 UI） */
export interface ModuleDescriptor {
  /** 模块 id，与 modules/<id>/ 目录名一致 */
  id: string
  displayName: string
  /** 模块形态：service/skill/agent */
  kind: ModuleKind
  version: string
  enabled: boolean
  /** 该模块 patch 插装的 service 行 id 列表 */
  serviceIds: string[]
}

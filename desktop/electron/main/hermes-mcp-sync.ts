/** @file Hermes MCP 同步：把启用中的 MCP 写入 $HERMES_HOME/config.yaml 的 mcp_servers 段
 *
 * 将 MCP 服务器直接写入 Hermes 原生 config.yaml 的 mcp_servers：
 * 顶层 "mcp_servers.<name>"（stdio: command/args/env；HTTP: url/headers）。
 * - 只补丁 mcp_servers 块，其它行原样保留（用户手改的 model/custom_providers/注释不受影响）；
 * - 不触碰 platform_toolsets（cli: [no_mcp] 仍由编排层保留），工具/服务器启停由 Hermes 侧另行控制；
 * - 纯函数可单测（js-yaml，不 import electron）。
 */
import { load, dump } from 'js-yaml'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { McpServerSpec } from './service-registry/mcp-reconcile'

export interface HermesMcpMergeResult {
  changed: boolean
  /** 规整为 LF 的全文（写入时按目标文件 EOL 转换） */
  yaml: string
  servers: Record<string, unknown>
}

/** 读取 config.yaml 里已有的 mcp_servers（解析失败则视为空，不影响后续文本补丁） */
function readExistingMcpServers(rawYaml: string): Record<string, unknown> {
  try {
    const cfg = load(rawYaml) as Record<string, unknown> | null
    const v = cfg?.mcp_servers
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** 把顶层 "key:" 块替换为 blockLines；不存在则追加（blockLines 为空则删除该块） */
function patchTopLevelBlock(text: string, key: string, blockLines: string[]): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const idx = lines.findIndex((l) => new RegExp('^' + key + ':').test(l))
  if (idx < 0) {
    if (blockLines.length === 0) return text
    const head = lines.join('\n').replace(/\n+$/, '')
    return (head ? head + '\n' : '') + blockLines.join('\n') + '\n'
  }
  let end = idx + 1
  while (end < lines.length) {
    const l = lines[end]
    if (!l.trim() || /^\S/.test(l)) break
    end++
  }
  const next =
    blockLines.length === 0
      ? [...lines.slice(0, idx), ...lines.slice(end)].join('\n')
      : [...lines.slice(0, idx), ...blockLines, ...lines.slice(end)].join('\n')
  return next.replace(/\n{3,}/g, '\n\n')
}

/** 纯函数：合并 mcp_servers。servers.enabled=false 不写入；removedNames 精确移除。 */
export function mergeHermesMcpServers(
  rawYaml: string,
  servers: McpServerSpec[],
  removedNames: string[] = [],
): HermesMcpMergeResult {
  const existing = readExistingMcpServers(rawYaml)
  const removeSet = new Set(removedNames)
  const base: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(existing)) {
    if (!removeSet.has(k)) base[k] = v
  }
  const incoming: Record<string, unknown> = {}
  for (const s of servers) {
    if (!s.enabled) continue
    if (s.url) incoming[s.name] = { url: s.url }
    else if (s.command) incoming[s.name] = { command: s.command, args: s.args || [], env: s.env || {} }
  }
  const merged = { ...base, ...incoming }
  if (Object.keys(existing).length === 0 && Object.keys(merged).length === 0) {
    return { changed: false, yaml: rawYaml, servers: merged }
  }
  const blockLines =
    Object.keys(merged).length === 0
      ? []
      : dump({ mcp_servers: merged }, { lineWidth: 120, noRefs: true, indent: 2 }).replace(/\n+$/, '\n').split('\n')
  const next = patchTopLevelBlock(rawYaml.replace(/\r\n/g, '\n'), 'mcp_servers', blockLines)
  return { changed: next.trim() !== rawYaml.replace(/\r\n/g, '\n').trim(), yaml: next, servers: merged }
}

/** 写入 Hermes config.yaml 的 mcp_servers（文件不存在则跳过，避免误建）。返回是否发生变更。 */
export function writeHermesMcpServers(
  configPath: string,
  servers: McpServerSpec[],
  removedNames: string[] = [],
): boolean {
  if (!existsSync(configPath)) return false
  const raw = readFileSync(configPath, 'utf-8')
  const result = mergeHermesMcpServers(raw, servers, removedNames)
  if (!result.changed) return false
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  writeFileSync(configPath, result.yaml.split('\n').join(eol), 'utf-8')
  return true
}

/** 从后端拉取启用中的 MCP 并写入 Hermes config.yaml；
 * 失败仅返回 error，不抛异常）。configPath/baseUrl 由调用方注入，避免模块依赖 electron。
 */
export async function syncHermesMcpFromBackend(
  token: string,
  configPath: string,
  baseUrl: string,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (!token) return { ok: false, error: '未登录' }
  try {
    const res = await fetch(baseUrl + '/mcp/servers', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status }
    const body = (await res.json()) as unknown
    const list = (Array.isArray(body) ? body : ((body as { data?: unknown[] })?.data ?? [])) as Array<{
      name: string
      command?: string
      args?: string[]
      env?: Record<string, string>
      url?: string
      enabled?: boolean
    }>
    const enabled = list
      .filter((s) => s.enabled !== false)
      .map((s) => ({ name: s.name, command: s.command, args: s.args, env: s.env, url: s.url, enabled: true }))
    writeHermesMcpServers(configPath, enabled)
    return { ok: true, count: enabled.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

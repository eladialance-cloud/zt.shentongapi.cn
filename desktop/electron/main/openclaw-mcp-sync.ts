// OpenClaw MCP 同步：把后端用户启用中的 MCP 写入 <OPENCLAW_HOME>/.openclaw/openclaw.json
// 失败仅返回 error，不抛异常（调用方 fire-and-forget）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { getOpenClawHome } from './local-market/local-content-manager'
import { ST_API_BASE } from './service-manager'

export function readOpenClawConfig(): Record<string, unknown> {
  const p = path.join(getOpenClawHome(), '.openclaw', 'openclaw.json')
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function writeOpenClawMcpServers(
  servers: Array<{
    name: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
    enabled: boolean
  }>
): void {
  const cfgPath = path.join(getOpenClawHome(), '.openclaw', 'openclaw.json')
  const cfg = readOpenClawConfig()
  const mcpServers: Record<string, unknown> = {}
  for (const s of servers) {
    if (!s.enabled) continue
    if (s.url) {
      mcpServers[s.name] = { url: s.url }
    } else if (s.command) {
      mcpServers[s.name] = { command: s.command, args: s.args || [], env: s.env || {} }
    }
  }
  cfg.mcpServers = mcpServers
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true })
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf-8')
}

/** 从后端拉取启用中的 MCP 并写入 openclaw.json；返回 { ok, count?, error? } */
export async function syncOpenClawMcpFromBackend(
  token: string
): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (!token) return { ok: false, error: '未登录' }
  try {
    const res = await fetch(ST_API_BASE + '/mcp/servers', {
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
    const enabled = list.filter((s) => s.enabled !== false)
    writeOpenClawMcpServers(
      enabled.map((s) => ({
        name: s.name,
        command: s.command,
        args: s.args,
        env: s.env,
        url: s.url,
        enabled: true,
      }))
    )
    return { ok: true, count: enabled.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

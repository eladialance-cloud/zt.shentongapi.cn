/**
 * 纯函数：Hermes config.yaml mcp_servers 合并/移除逻辑（不 import electron / 运行时模块，保证可单测）。
 * 语义：
 * - servers.enabled=false 的项只不写入，不主动删除（兼容 backend / computer-control 合并）；
 * - removedNames 精确移除（模块停用后清掉其声明过的 MCP 名，避免失效 server 残留）。
 */

export interface McpServerSpec {
  name: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  enabled: boolean
}

export function computeMcpSection(
  currentMcp: Record<string, unknown> | undefined,
  currentLegacyMcp: Record<string, unknown> | undefined,
  servers: McpServerSpec[],
  removedNames: string[],
): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {}
  for (const s of servers) {
    if (!s.enabled) continue
    if (s.url) {
      mcpServers[s.name] = { url: s.url }
    } else if (s.command) {
      mcpServers[s.name] = { command: s.command, args: s.args || [], env: s.env || {} }
    }
  }

  const existingMcp = currentMcp ?? {}
  const existingServers = (existingMcp.servers as Record<string, unknown> | undefined) ?? {}
  const legacyMcp = currentLegacyMcp ?? {}

  const removeSet = new Set(removedNames)
  const base: Record<string, unknown> = {}
  for (const [k, v] of Object.entries({ ...existingServers, ...legacyMcp })) {
    if (!removeSet.has(k)) base[k] = v
  }

  return { ...existingMcp, servers: { ...base, ...mcpServers } }
}

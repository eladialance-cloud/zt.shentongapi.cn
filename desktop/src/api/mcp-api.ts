//
// POST /mcp/servers 创建服务器
// PUT /mcp/servers/:id 更新服务器
// DELETE /mcp/servers/:id 删服务器
// POST /mcp/servers/:id/call 调用工具

import { httpClient } from './http-client'
import type { OwnershipFields, OwnerType } from '@/types/resource'

/**
 * MCP 服务器
 *
 * Task 13: 通过 intersection 扩展 OwnershipFields（ownerType / ownerId / version）。
 * TODO(backend): 后端 mcp_server 表需新增 owner_type / owner_id / version 列，
 *                并在 /mcp/servers 列表接口支持 ?ownerType=official|team|user。
 */
export interface McpServer extends OwnershipFields {
 id: number
 name: string
 description?: string
 transportType: 'stdio' | 'http' | 'streamable-http'
 /** 兼容旧代码的别名 */
 transport?: 'stdio' | 'http' | 'streamable-http'
 command?: string
 args?: string[]
 env?: Record<string, string>
 url?: string
 headers?: Record<string, string>
 enabled: boolean
 status?: string
 lastConnectedAt?: string
 createdAt: string
 updatedAt: string
}

export interface McpTool {
 name: string
 description?: string
 inputSchema?: Record<string, unknown>
}

/** MCP 网关信息（GET /mcp） */
export interface McpInfo {
  name: string
  version: string
  /** 已注册服务器数量 */
 serverCount: number
  /** 支持的传输类型 */
 transports: string[]
}

/** 健康检查结果（MCP 基座） */
export interface McpHealthResult {
  status: 'healthy' | 'unhealthy' | 'degraded'
  version?: string
  latencyMs?: number
  message?: string
}

/** 探测结果 */
export interface McpProbeResult {
  reachable: boolean
  latencyMs?: number
  toolCount?: number
  errorMessage?: string
}

/**
 * MCP 服务器列表查询参数
 *
 * Task 13: 三级资源归属过滤。
 * TODO(backend): 后端 /mcp/servers 需支持 ?ownerType=official|team|user。
 */
export interface McpServerListQuery {
 ownerType?: OwnerType
}

export const mcpApi = {
 /**
  * MCP 网关信息
  * GET /mcp
  */
 getInfo: () => httpClient.get<McpInfo>('/mcp'),

 /**
  * 健康检查
  * GET /mcp/health
  */
 getHealth: () => httpClient.get<McpHealthResult>('/mcp/health'),

 /**
  * 探测服务器连通性
  * POST /mcp/servers/:serverId/probe
  */
 probeServer: (serverId: number) =>
   httpClient.post<McpProbeResult>(`/mcp/servers/${serverId}/probe`),

 listServers: (query: McpServerListQuery = {}) =>
   httpClient.get<McpServer[]>('/mcp/servers', { params: query }),

 getServer: (id: number) =>
 httpClient.get<McpServer>(`/mcp/servers/${id}`),

 createServer: (data: Partial<McpServer>) => {
 const payload: Record<string, unknown> = { ...data }
 if (data.transport && !data.transportType) {
 payload.transportType = data.transport
 delete payload.transport
 }
 return httpClient.post<McpServer>('/mcp/servers', payload)
 },

 updateServer: (id: number, data: Partial<McpServer>) => {
 const payload: Record<string, unknown> = { ...data }
 if (data.transport && !data.transportType) {
 payload.transportType = data.transport
 delete payload.transport
 }
 return httpClient.put<McpServer>(`/mcp/servers/${id}`, payload)
 },

 deleteServer: (id: number) =>
 httpClient.delete<void>(`/mcp/servers/${id}`),

 listTools: (serverId: number) =>
 httpClient.get<McpTool[]>(`/mcp/servers/${serverId}/tools`),

 callTool: (serverId: number, toolName: string, args: Record<string, unknown>) =>
 httpClient.post<unknown>('/mcp/call', {
 serverId: String(serverId),
 toolName,
 args,
 }),
}

export default mcpApi

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
 /** 后端标记来源：official=官方目录安装 / custom=自定义添加 / chat=对话安装 */
 source?: 'official' | 'custom' | 'chat'
 /** 官方目录条目 id（source=official 时存在，与本地 mcp.json 的目录 id 对应） */
 catalogId?: number | null
 /** 工具数量（后端汇总） */
 toolCount?: number
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

/** 官方 MCP 目录条目（GET /mcp/catalog） */
export interface McpCatalogItem {
 id: number
 name: string
 description?: string
 category?: string
 tags?: string[]
 icon?: string
 homepage?: string
 sourceUrl?: string
 license?: string
 runtime: 'node' | 'python' | 'docker' | 'http'
 securityLevel: 'official' | 'community'
 transportType: 'stdio' | 'http' | 'streamable-http'
 command?: string
 args?: string[]
 envTemplate?: Array<{ key: string; label: string; required?: boolean; secret?: boolean; default?: string; description?: string }>
 url?: string
 headers?: Record<string, string>
 version: string
 isInstalled: boolean
 mcpServerId?: number | null
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
  * 官方目录列表
  * GET /mcp/catalog
  */
 listCatalog: (query: { category?: string; keyword?: string }) =>
  httpClient.get<{ total: number; list: McpCatalogItem[] }>('/mcp/catalog', { params: query }),

 /**
  * 官方目录详情
  * GET /mcp/catalog/:id
  */
 getCatalog: (id: number) =>
  httpClient.get<McpCatalogItem>(`/mcp/catalog/${id}`),

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

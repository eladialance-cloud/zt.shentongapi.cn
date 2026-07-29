//
// POST   /admin/mcp/servers           新增服务
// POST   /admin/mcp/servers/:id/discover  发现工具
// POST   /admin/mcp/tools             新增工具
// GET    /admin/mcp/logs              调用日志

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  McpServerConfig,
  McpToolRegistry,
  McpResourceRegistry,
  McpCallLog,
  McpServerQuery,
  McpToolQuery,
  McpLogQuery,
  CreateServerConfigDto,
  UpdateServerConfigDto,
  CreateMcpToolDto,
  UpdateMcpToolDto,
  CreateMcpResourceDto,
  UpdateMcpResourceDto
} from '@/types/admin-mcp'

// ==================== MCP 服务 ====================

export async function listMcpServers(
  query: McpServerQuery = {}
): Promise<AdminPaginatedResult<McpServerConfig>> {
  return adminRequest<AdminPaginatedResult<McpServerConfig>>(
    'get',
    '/admin/mcp/servers',
    { params: query as Record<string, unknown> }
  )
}

/** 新增 MCP 服务 */
export async function createMcpServer(
  dto: CreateServerConfigDto
): Promise<McpServerConfig> {
  return adminRequest<McpServerConfig>('post', '/admin/mcp/servers', { data: dto })
}

export async function updateMcpServer(
  id: number,
  dto: UpdateServerConfigDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/mcp/servers/${id}`, { data: dto })
}

export async function deleteMcpServer(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/mcp/servers/${id}`)
}

/** 发现 MCP 服务工具 */
export async function discoverTools(id: number): Promise<McpToolRegistry[]> {
  return adminRequest<McpToolRegistry[]>('post', `/admin/mcp/servers/${id}/discover`)
}

// ==================== MCP 工具 ====================

export async function listMcpTools(
  query: McpToolQuery = {}
): Promise<AdminPaginatedResult<McpToolRegistry>> {
  return adminRequest<AdminPaginatedResult<McpToolRegistry>>(
    'get',
    '/admin/mcp/tools',
    { params: query as Record<string, unknown> }
  )
}

/** 新增 MCP 工具 */
export async function createMcpTool(
  dto: CreateMcpToolDto
): Promise<McpToolRegistry> {
  return adminRequest<McpToolRegistry>('post', '/admin/mcp/tools', { data: dto })
}

export async function updateMcpTool(
  id: number,
  dto: UpdateMcpToolDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/mcp/tools/${id}`, { data: dto })
}

export async function deleteMcpTool(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/mcp/tools/${id}`)
}


export async function listMcpResources(
  query: { serverId?: number; keyword?: string } = {}
): Promise<AdminPaginatedResult<McpResourceRegistry>> {
  return adminRequest<AdminPaginatedResult<McpResourceRegistry>>(
    'get',
    '/admin/mcp/resources',
    { params: query as Record<string, unknown> }
  )
}

export async function createMcpResource(
  dto: CreateMcpResourceDto
): Promise<McpResourceRegistry> {
  return adminRequest<McpResourceRegistry>('post', '/admin/mcp/resources', { data: dto })
}

export async function updateMcpResource(
  id: number,
  dto: UpdateMcpResourceDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/mcp/resources/${id}`, { data: dto })
}

export async function deleteMcpResource(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/mcp/resources/${id}`)
}

// ==================== MCP 调用日志 ====================

export async function listMcpLogs(
  query: McpLogQuery = {}
): Promise<AdminPaginatedResult<McpCallLog>> {
  return adminRequest<AdminPaginatedResult<McpCallLog>>(
    'get',
    '/admin/mcp/logs',
    { params: query as Record<string, unknown> }
  )
}

export default {
  // 服务
  listMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  discoverTools,
  // 工具
  listMcpTools,
  createMcpTool,
  updateMcpTool,
  deleteMcpTool,
  listMcpResources,
  createMcpResource,
  updateMcpResource,
  deleteMcpResource,
  // 日志
  listMcpLogs
}

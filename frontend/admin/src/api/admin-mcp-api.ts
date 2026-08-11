// 管理端 MCP 管理 API
//
// 端点契约：
//   GET    /admin/mcp/servers?keyword=&serviceType=&status=    服务列表
//   POST   /admin/mcp/servers                                    创建服务
//   PATCH  /admin/mcp/servers/:id                                更新服务
//   DELETE /admin/mcp/servers/:id                                删除服务
//   POST   /admin/mcp/servers/:id/discover                       自动发现工具
//   GET    /admin/mcp/tools?serverId=&keyword=                   工具列表
//   POST   /admin/mcp/tools                                      注册工具
//   PATCH  /admin/mcp/tools/:id                                  更新工具
//   DELETE /admin/mcp/tools/:id                                  删除工具
//   GET    /admin/mcp/resources?serverId=&keyword=               资源列表
//   POST   /admin/mcp/resources                                  注册资源
//   PATCH  /admin/mcp/resources/:id                              更新资源
//   DELETE /admin/mcp/resources/:id                              删除资源
//   GET    /admin/mcp/logs?serverId=&userId=&callType=&status=&page=&pageSize=  调用日志

import { adminRequest } from './admin-auth-api'
import type {
  CreateMcpResourceDto,
  CreateMcpServerDto,
  CreateMcpToolDto,
  McpCallLog,
  McpCallLogQuery,
  McpListResult,
  McpPaginatedResult,
  McpResourceQuery,
  McpResourceRegistry,
  McpServerConfig,
  McpServerQuery,
  McpToolQuery,
  McpToolRegistry,
  UpdateMcpResourceDto,
  UpdateMcpServerDto,
  UpdateMcpToolDto,
  McpCatalog,
  McpCatalogListResult,
  McpCatalogQuery
} from '@/types/admin-mcp'

/** 服务列表 */
export async function listMcpServers(
  query: McpServerQuery = {}
): Promise<McpListResult<McpServerConfig>> {
  return adminRequest<McpListResult<McpServerConfig>>(
    'get',
    '/admin/mcp/servers',
    { params: query as Record<string, unknown> }
  )
}

/** 创建服务 */
export async function createMcpServer(
  dto: CreateMcpServerDto
): Promise<McpServerConfig> {
  return adminRequest<McpServerConfig>('post', '/admin/mcp/servers', {
    data: dto
  })
}

/** 更新服务 */
export async function updateMcpServer(
  id: number,
  dto: UpdateMcpServerDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/mcp/servers/${id}`, { data: dto })
}

/** 删除服务 */
export async function deleteMcpServer(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/mcp/servers/${id}`)
}

/** 自动发现工具 */
export async function discoverMcpTools(
  id: number
): Promise<McpToolRegistry[]> {
  return adminRequest<McpToolRegistry[]>(
    'post',
    `/admin/mcp/servers/${id}/discover`
  )
}

/** 工具列表 */
export async function listMcpTools(
  query: McpToolQuery = {}
): Promise<McpListResult<McpToolRegistry>> {
  return adminRequest<McpListResult<McpToolRegistry>>(
    'get',
    '/admin/mcp/tools',
    { params: query as Record<string, unknown> }
  )
}

/** 注册工具 */
export async function createMcpTool(
  dto: CreateMcpToolDto
): Promise<McpToolRegistry> {
  return adminRequest<McpToolRegistry>('post', '/admin/mcp/tools', {
    data: dto
  })
}

/** 更新工具 */
export async function updateMcpTool(
  id: number,
  dto: UpdateMcpToolDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/mcp/tools/${id}`, { data: dto })
}

/** 删除工具 */
export async function deleteMcpTool(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/mcp/tools/${id}`)
}

/** 资源列表 */
export async function listMcpResources(
  query: McpResourceQuery = {}
): Promise<McpListResult<McpResourceRegistry>> {
  return adminRequest<McpListResult<McpResourceRegistry>>(
    'get',
    '/admin/mcp/resources',
    { params: query as Record<string, unknown> }
  )
}

/** 注册资源 */
export async function createMcpResource(
  dto: CreateMcpResourceDto
): Promise<McpResourceRegistry> {
  return adminRequest<McpResourceRegistry>('post', '/admin/mcp/resources', {
    data: dto
  })
}

/** 更新资源 */
export async function updateMcpResource(
  id: number,
  dto: UpdateMcpResourceDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/mcp/resources/${id}`, {
    data: dto
  })
}

/** 删除资源 */
export async function deleteMcpResource(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/mcp/resources/${id}`)
}

/** 调用日志 */
export async function listMcpCallLogs(
  query: McpCallLogQuery = {}
): Promise<McpPaginatedResult<McpCallLog>> {
  return adminRequest<McpPaginatedResult<McpCallLog>>(
    'get',
    '/admin/mcp/logs',
    { params: query as Record<string, unknown> }
  )
}


/** 官方目录列表 */
export async function listMcpCatalog(
  query: McpCatalogQuery = {}
): Promise<McpCatalogListResult> {
  return adminRequest<McpCatalogListResult>('get', '/admin/mcp-catalog', {
    params: query as Record<string, unknown>
  })
}

/** 官方目录详情 */
export async function getMcpCatalog(id: number): Promise<McpCatalog> {
  return adminRequest<McpCatalog>('get', `/admin/mcp-catalog/${id}`)
}

/** 创建官方目录条目 */
export async function createMcpCatalog(
  dto: Omit<McpCatalog, 'id'>
): Promise<McpCatalog> {
  return adminRequest<McpCatalog>('post', '/admin/mcp-catalog', { data: dto })
}

/** 更新官方目录条目 */
export async function updateMcpCatalog(
  id: number,
  dto: Partial<Omit<McpCatalog, 'id'>>
): Promise<McpCatalog> {
  return adminRequest<McpCatalog>('put', `/admin/mcp-catalog/${id}`, {
    data: dto
  })
}

/** 切换上架状态 */
export async function toggleMcpCatalog(id: number): Promise<McpCatalog> {
  return adminRequest<McpCatalog>('post', `/admin/mcp-catalog/${id}/toggle`)
}

/** 删除官方目录条目 */
export async function removeMcpCatalog(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/mcp-catalog/${id}`)
}

/** 官方目录 API 集合 */
export const adminMcpCatalogApi = {
  list: listMcpCatalog,
  get: getMcpCatalog,
  create: createMcpCatalog,
  update: updateMcpCatalog,
  toggle: toggleMcpCatalog,
  remove: removeMcpCatalog
}

export default {
  listMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  discoverMcpTools,
  listMcpTools,
  createMcpTool,
  updateMcpTool,
  deleteMcpTool,
  listMcpResources,
  createMcpResource,
  updateMcpResource,
  deleteMcpResource,
  listMcpCallLogs,
  listMcpCatalog,
  getMcpCatalog,
  createMcpCatalog,
  updateMcpCatalog,
  toggleMcpCatalog,
  removeMcpCatalog,
  adminMcpCatalogApi
}

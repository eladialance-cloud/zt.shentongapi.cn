// 管理端 MCP 模块类型定义
// 数据合同真源：admin-mcp 后端控制器 /admin/mcp

/** MCP 传输类型 */
export type McpTransportType = 'stdio' | 'http' | 'streamable-http'

/** MCP 服务类型 */
export type McpServiceType = 'openclaw' | 'codex' | 'n8n' | 'custom'

/** MCP 服务状态 */
export type McpServerStatus = 'pending' | 'connected' | 'failed' | 'disabled'

/** MCP 资源类型 */
export type McpResourceType = 'agent' | 'workflow' | 'data' | 'file' | 'prompt'

/** MCP 调用类型 */
export type McpCallType = 'tool' | 'resource'

/** MCP 调用日志状态 */
export type McpCallStatus = 'success' | 'failed' | 'timeout'

/** MCP 服务配置 */
export interface McpServerConfig {
  id: number
  name: string
  description: string
  transportType: McpTransportType
  command: string
  args: string[]
  env: Record<string, string>
  url: string
  headers: Record<string, string>
  isSystem: boolean
  serviceType: McpServiceType
  enabled: boolean
  status: McpServerStatus
  lastConnectedAt?: string
  toolCount: number
  createdAt: string
  updatedAt: string
}

/** MCP 工具注册 */
export interface McpToolRegistry {
  id: number
  serverId: number
  toolName: string
  displayName: string
  description: string
  inputSchema: Record<string, unknown>
  category: string
  isEnabled: boolean
  callCount: number
  createdAt: string
  updatedAt: string
}

/** MCP 资源注册 */
export interface McpResourceRegistry {
  id: number
  serverId: number
  resourceUri: string
  resourceType: McpResourceType
  displayName: string
  description: string
  metadata: Record<string, unknown>
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

/** MCP 调用日志 */
export interface McpCallLog {
  id: number
  userId: number
  serverId: number
  toolName: string
  resourceUri: string
  callType: McpCallType
  requestData: Record<string, unknown>
  responseData: Record<string, unknown>
  status: McpCallStatus
  errorMessage: string
  durationMs: number
  createdAt: string
  updatedAt: string
}

/** 服务列表查询参数 */
export interface McpServerQuery {
  keyword?: string
  serviceType?: McpServiceType | ''
  status?: McpServerStatus | ''
}

/** 工具列表查询参数 */
export interface McpToolQuery {
  serverId?: number
  keyword?: string
}

/** 资源列表查询参数 */
export interface McpResourceQuery {
  serverId?: number
  keyword?: string
}

/** 调用日志查询参数 */
export interface McpCallLogQuery {
  serverId?: number
  userId?: number
  callType?: McpCallType | ''
  status?: McpCallStatus | ''
  page?: number
  pageSize?: number
}

/** 创建服务 DTO */
export interface CreateMcpServerDto {
  name: string
  description: string
  transportType: McpTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  serviceType: McpServiceType
  enabled?: boolean
}

/** 更新服务 DTO */
export interface UpdateMcpServerDto {
  name?: string
  description?: string
  transportType?: McpTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  serviceType?: McpServiceType
  enabled?: boolean
}

/** 创建工具 DTO */
export interface CreateMcpToolDto {
  serverId: number
  toolName: string
  displayName: string
  description: string
  inputSchema?: Record<string, unknown>
  category?: string
  isEnabled?: boolean
}

/** 更新工具 DTO */
export interface UpdateMcpToolDto {
  serverId?: number
  toolName?: string
  displayName?: string
  description?: string
  inputSchema?: Record<string, unknown>
  category?: string
  isEnabled?: boolean
}

/** 创建资源 DTO */
export interface CreateMcpResourceDto {
  serverId: number
  resourceUri: string
  resourceType: McpResourceType
  displayName: string
  description: string
  metadata?: Record<string, unknown>
  isEnabled?: boolean
}

/** 更新资源 DTO */
export interface UpdateMcpResourceDto {
  serverId?: number
  resourceUri?: string
  resourceType?: McpResourceType
  displayName?: string
  description?: string
  metadata?: Record<string, unknown>
  isEnabled?: boolean
}

/** 列表响应（servers/tools/resources） */
export interface McpListResult<T> {
  list: T[]
  total: number
}

/** 分页列表响应（logs） */
export interface McpPaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}


/** MCP 运行时类型 */
export type McpRuntime = 'node' | 'python' | 'docker' | 'http'

/** MCP 安全分级 */
export type McpSecurityLevel = 'official' | 'community'

/** 环境变量模板项 */
export interface EnvTemplateItem {
  key: string
  label?: string
  required?: boolean
  secret?: boolean
  default?: string
  description?: string
}

/** 官方目录条目 */
export interface McpCatalog {
  id: number
  name: string
  description?: string
  category?: string
  tags?: string[]
  icon?: string
  homepage?: string
  sourceUrl?: string
  license?: string
  runtime: McpRuntime
  securityLevel: McpSecurityLevel
  transportType: McpTransportType
  command?: string
  args?: string[]
  envTemplate?: EnvTemplateItem[]
  url?: string
  headers?: Record<string, string>
  version?: string
  enabled?: boolean
  sortOrder?: number
  toolCount?: number
  downloadCount?: number
}

/** 官方目录查询参数 */
export interface McpCatalogQuery {
  keyword?: string
  category?: string
  enabled?: string
  page?: number
  pageSize?: number
}

/** 官方目录分页列表响应 */
export interface McpCatalogListResult {
  list: McpCatalog[]
  total: number
  page: number
  pageSize: number
}

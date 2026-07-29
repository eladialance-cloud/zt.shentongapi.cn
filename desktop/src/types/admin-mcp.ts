import type { AdminPaginatedResult } from './admin-auth'

export type TransportType = 'stdio' | 'http' | 'streamable-http'

export type ServiceType = 'openclaw' | 'codex' | 'n8n' | 'custom'

/** MCP 服务状态 */
export type McpServerStatus = 'pending' | 'connected' | 'failed' | 'disabled'

/** MCP 服务配置 */
export interface McpServerConfig {
  id: number
  name: string
  description?: string
  transportType: TransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  isSystem: boolean
  serviceType: ServiceType
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
  displayName?: string
  description?: string
  inputSchema?: Record<string, unknown>
  category?: string
  isEnabled: boolean
  callCount: number
  createdAt: string
  updatedAt: string
}

export type ResourceType = 'agent' | 'workflow' | 'data' | 'file' | 'prompt'

export interface McpResourceRegistry {
  id: number
  serverId: number
  resourceUri: string
  resourceType: ResourceType
  displayName?: string
  description?: string
  metadata?: Record<string, unknown>
  isEnabled: boolean
  createdAt: string
  updatedAt: string
}

/** MCP 调用日志 */
export type McpCallStatus = 'success' | 'failed' | 'timeout'

export interface McpCallLog {
  id: number
  userId?: number
  serverId?: number
  toolName?: string
  resourceUri?: string
  callType: 'tool' | 'resource'
  status: McpCallStatus
  errorMessage?: string
  durationMs?: number
  createdAt: string
}

export interface McpServerQuery {
  keyword?: string
  serviceType?: ServiceType | ''
  status?: McpServerStatus | ''
}

export interface McpToolQuery {
  serverId?: number
  keyword?: string
}

export interface McpLogQuery {
  serverId?: number
  status?: McpCallStatus | ''
  page?: number
  pageSize?: number
}

/** DTO */
export interface CreateServerConfigDto {
  name: string
  description?: string
  transportType: TransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  serviceType?: ServiceType
}

export interface UpdateServerConfigDto extends Partial<CreateServerConfigDto> {
  enabled?: boolean
}

/** 工具 DTO */
export interface CreateMcpToolDto {
  serverId: number
  toolName: string
  displayName?: string
  description?: string
  inputSchema?: Record<string, unknown>
  category?: string
  isEnabled?: boolean
}

export interface UpdateMcpToolDto extends Partial<CreateMcpToolDto> {}

export interface CreateMcpResourceDto {
  serverId: number
  resourceUri: string
  resourceType: ResourceType
  displayName?: string
  description?: string
  metadata?: Record<string, unknown>
  isEnabled?: boolean
}

export interface UpdateMcpResourceDto extends Partial<CreateMcpResourceDto> {}

export type McpServerListResult = AdminPaginatedResult<McpServerConfig>
export type McpToolListResult = AdminPaginatedResult<McpToolRegistry>
export type McpResourceListResult = AdminPaginatedResult<McpResourceRegistry>
export type McpLogListResult = AdminPaginatedResult<McpCallLog>

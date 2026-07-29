// 管理端 Agent 扩展管理模块类型定义
// 数据合同真源：admin-agent-ext 控制器

/** Agent 部门 */
export interface AgentDepartment {
  id: number
  name: string
  description: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

/** 创建部门 DTO */
export interface CreateAgentDepartmentDto {
  name: string
  description?: string
  sortOrder?: number
}

/** 更新部门 DTO */
export interface UpdateAgentDepartmentDto {
  name?: string
  description?: string
  sortOrder?: number
}

/** Agent 标签 */
export interface AgentTag {
  id: number
  name: string
  /** 十六进制颜色，如 #38bdf8 */
  color: string
  createdAt: string
  updatedAt: string
}

/** 创建标签 DTO */
export interface CreateAgentTagDto {
  name: string
  color: string
}

/** 更新标签 DTO */
export interface UpdateAgentTagDto {
  name?: string
  color?: string
}

/** Agent-标签关联 */
export interface AgentTagMap {
  id: number
  agentId: number
  tagId: number
  createdAt: string
}

/** Agent 版本信息 */
export interface AgentVersionInfo {
  agentId: number
  version: string
  changelog?: string
  updatedAt: string
}

/** 版本升级 DTO */
export interface BumpAgentVersionDto {
  changelog?: string
}

/** 同步 Agent 响应 */
export interface SyncAgentResult {
  agentId: number
  success: boolean
  message?: string
}

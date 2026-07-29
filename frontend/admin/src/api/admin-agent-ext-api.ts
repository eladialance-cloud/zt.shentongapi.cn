// 管理端 Agent 扩展管理 API
//
// 端点契约：
//   GET    /admin/agent-ext/departments              部门列表
//   POST   /admin/agent-ext/departments              创建部门
//   PATCH  /admin/agent-ext/departments/:id          更新部门
//   DELETE /admin/agent-ext/departments/:id          删除部门
//   GET    /admin/agent-ext/tags                     标签列表
//   POST   /admin/agent-ext/tags                     创建标签
//   PATCH  /admin/agent-ext/tags/:id                 更新标签
//   DELETE /admin/agent-ext/tags/:id                 删除标签
//   POST   /admin/agent-ext/agents/:agentId/tags     为Agent打标签
//   GET    /admin/agent-ext/agents/:agentId/tags     获取Agent的标签
//   GET    /admin/agent-ext/agents/:agentId/version  获取Agent版本信息
//   POST   /admin/agent-ext/agents/:agentId/version/bump  版本升级
//   POST   /admin/agent-ext/agents/:agentId/sync     同步Agent

import { adminRequest } from './admin-auth-api'
import type {
  AgentDepartment,
  AgentTag,
  AgentVersionInfo,
  BumpAgentVersionDto,
  CreateAgentDepartmentDto,
  CreateAgentTagDto,
  SyncAgentResult,
  UpdateAgentDepartmentDto,
  UpdateAgentTagDto
} from '@/types/admin-agent-ext'

// ===== 部门管理 =====

/** 部门列表 */
export async function listAgentDepartments(): Promise<AgentDepartment[]> {
  return adminRequest<AgentDepartment[]>('get', '/admin/agent-ext/departments')
}

/** 创建部门 */
export async function createAgentDepartment(
  dto: CreateAgentDepartmentDto
): Promise<AgentDepartment> {
  return adminRequest<AgentDepartment>('post', '/admin/agent-ext/departments', {
    data: dto
  })
}

/** 更新部门 */
export async function updateAgentDepartment(
  id: number,
  dto: UpdateAgentDepartmentDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/agent-ext/departments/${id}`, {
    data: dto
  })
}

/** 删除部门 */
export async function deleteAgentDepartment(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/agent-ext/departments/${id}`)
}

// ===== 标签管理 =====

/** 标签列表 */
export async function listAgentTags(): Promise<AgentTag[]> {
  return adminRequest<AgentTag[]>('get', '/admin/agent-ext/tags')
}

/** 创建标签 */
export async function createAgentTag(
  dto: CreateAgentTagDto
): Promise<AgentTag> {
  return adminRequest<AgentTag>('post', '/admin/agent-ext/tags', { data: dto })
}

/** 更新标签 */
export async function updateAgentTag(
  id: number,
  dto: UpdateAgentTagDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/agent-ext/tags/${id}`, { data: dto })
}

/** 删除标签 */
export async function deleteAgentTag(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/agent-ext/tags/${id}`)
}

// ===== Agent 扩展操作 =====

/** 为 Agent 打标签 */
export async function setAgentTags(
  agentId: number,
  tagIds: number[]
): Promise<void> {
  await adminRequest<void>('post', `/admin/agent-ext/agents/${agentId}/tags`, {
    data: { tagIds }
  })
}

/** 获取 Agent 的标签 */
export async function getAgentTags(agentId: number): Promise<AgentTag[]> {
  return adminRequest<AgentTag[]>(
    'get',
    `/admin/agent-ext/agents/${agentId}/tags`
  )
}

/** 获取 Agent 版本信息 */
export async function getAgentVersion(
  agentId: number
): Promise<AgentVersionInfo> {
  return adminRequest<AgentVersionInfo>(
    'get',
    `/admin/agent-ext/agents/${agentId}/version`
  )
}

/** 版本升级 */
export async function bumpAgentVersion(
  agentId: number,
  dto: BumpAgentVersionDto
): Promise<AgentVersionInfo> {
  return adminRequest<AgentVersionInfo>(
    'post',
    `/admin/agent-ext/agents/${agentId}/version/bump`,
    { data: dto }
  )
}

/** 同步 Agent */
export async function syncAgent(agentId: number): Promise<SyncAgentResult> {
  return adminRequest<SyncAgentResult>(
    'post',
    `/admin/agent-ext/agents/${agentId}/sync`
  )
}

export default {
  listAgentDepartments,
  createAgentDepartment,
  updateAgentDepartment,
  deleteAgentDepartment,
  listAgentTags,
  createAgentTag,
  updateAgentTag,
  deleteAgentTag,
  setAgentTags,
  getAgentTags,
  getAgentVersion,
  bumpAgentVersion,
  syncAgent
}

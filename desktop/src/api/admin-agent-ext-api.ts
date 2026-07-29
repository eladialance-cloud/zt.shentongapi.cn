//
// GET    /admin/agents/:id/version          版本信息
// POST   /admin/agents/:id/bump-version     版本递增
// POST   /admin/agents/:id/sync-openclaw    同步到OpenClaw

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AgentDepartment,
  AgentTag,
  CreateDepartmentDto,
  UpdateDepartmentDto,
  CreateTagDto,
  UpdateTagDto,
  BindTagsDto
} from '@/types/admin-agent-ext'

export async function listDepartments(): Promise<AgentDepartment[]> {
  return adminRequest<AgentDepartment[]>('get', '/admin/agents/departments')
}

export async function createDepartment(dto: CreateDepartmentDto): Promise<AgentDepartment> {
  return adminRequest<AgentDepartment>('post', '/admin/agents/departments', { data: dto })
}

export async function updateDepartment(id: number, dto: UpdateDepartmentDto): Promise<void> {
  await adminRequest<void>('patch', `/admin/agents/departments/${id}`, { data: dto })
}

export async function deleteDepartment(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/agents/departments/${id}`)
}

export async function listAgentTags(): Promise<AgentTag[]> {
  return adminRequest<AgentTag[]>('get', '/admin/agents/tags')
}

export async function createAgentTag(dto: CreateTagDto): Promise<AgentTag> {
  return adminRequest<AgentTag>('post', '/admin/agents/tags', { data: dto })
}

export async function updateAgentTag(id: number, dto: UpdateTagDto): Promise<void> {
  await adminRequest<void>('patch', `/admin/agents/tags/${id}`, { data: dto })
}

export async function deleteAgentTag(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/agents/tags/${id}`)
}

export async function getAgentTags(agentId: number): Promise<AgentTag[]> {
  return adminRequest<AgentTag[]>('get', `/admin/agents/${agentId}/tags`)
}

export async function bindAgentTags(agentId: number, dto: BindTagsDto): Promise<void> {
  await adminRequest<void>('post', `/admin/agents/${agentId}/tags/bind`, { data: dto })
}

/** 获取 Agent 版本信息 */
export async function getAgentVersion(agentId: number): Promise<{ version: number; history: unknown[] }> {
  return adminRequest<{ version: number; history: unknown[] }>('get', `/admin/agents/${agentId}/version`)
}

/** Agent 版本递增 */
export async function bumpAgentVersion(agentId: number): Promise<{ version: number }> {
  return adminRequest<{ version: number }>('post', `/admin/agents/${agentId}/bump-version`)
}

/** 同步 Agent 到 OpenClaw */
export async function syncAgentToOpenClaw(agentId: number): Promise<{ success: boolean; message: string }> {
  return adminRequest<{ success: boolean; message: string }>('post', `/admin/agents/${agentId}/sync-openclaw`)
}

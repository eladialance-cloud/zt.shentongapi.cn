//
// POST   /admin/workflow-lib              新增工作流
// POST   /admin/workflow-lib/import-github 从 GitHub 导入
// POST   /admin/workflow-lib/:id/mcp-binds 创建 MCP 绑定

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  WorkflowLibItem,
  WorkflowExecLog,
  WorkflowMcpBind,
  WorkflowLibQuery,
  CreateWorkflowLibDto,
  UpdateWorkflowLibDto,
  ImportGithubWorkflowDto,
  WorkflowBindType
} from '@/types/admin-workflow-lib'

export async function listWorkflowLib(
  query: WorkflowLibQuery = {}
): Promise<AdminPaginatedResult<WorkflowLibItem>> {
  return adminRequest<AdminPaginatedResult<WorkflowLibItem>>(
    'get',
    '/admin/workflow-lib',
    { params: query as Record<string, unknown> }
  )
}

export async function getWorkflowLib(id: number): Promise<WorkflowLibItem> {
  return adminRequest<WorkflowLibItem>('get', `/admin/workflow-lib/${id}`)
}

/** 新增工作流 */
export async function createWorkflowLib(
  dto: CreateWorkflowLibDto
): Promise<WorkflowLibItem> {
  return adminRequest<WorkflowLibItem>('post', '/admin/workflow-lib', { data: dto })
}

export async function updateWorkflowLib(
  id: number,
  dto: UpdateWorkflowLibDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/workflow-lib/${id}`, { data: dto })
}

export async function deleteWorkflowLib(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/workflow-lib/${id}`)
}

/** 从 GitHub 导入工作流 */
export async function importFromGithub(
  dto: ImportGithubWorkflowDto
): Promise<WorkflowLibItem> {
  return adminRequest<WorkflowLibItem>('post', '/admin/workflow-lib/import-github', {
    data: dto
  })
}

export async function listExecLogs(
  id: number,
  query: { page?: number; pageSize?: number } = {}
): Promise<AdminPaginatedResult<WorkflowExecLog>> {
  return adminRequest<AdminPaginatedResult<WorkflowExecLog>>(
    'get',
    `/admin/workflow-lib/${id}/exec-logs`,
    { params: query as Record<string, unknown> }
  )
}

export async function listMcpBinds(id: number): Promise<WorkflowMcpBind[]> {
  return adminRequest<WorkflowMcpBind[]>('get', `/admin/workflow-lib/${id}/mcp-binds`)
}

/** 创建 MCP 绑定 */
export async function createMcpBind(
  id: number,
  body: { mcpResourceId: number; bindType: WorkflowBindType; config?: Record<string, unknown> }
): Promise<WorkflowMcpBind> {
  return adminRequest<WorkflowMcpBind>('post', `/admin/workflow-lib/${id}/mcp-binds`, {
    data: body
  })
}

export async function deleteMcpBind(bindId: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/workflow-lib/mcp-binds/${bindId}`)
}

export default {
  listWorkflowLib,
  getWorkflowLib,
  createWorkflowLib,
  updateWorkflowLib,
  deleteWorkflowLib,
  importFromGithub,
  listExecLogs,
  listMcpBinds,
  createMcpBind,
  deleteMcpBind
}

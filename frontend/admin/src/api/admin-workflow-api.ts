// 管理端工作流模板管理 API（合并版）
//
// 端点契约（全部走 /admin/workflows）：
//   GET    /admin/workflows                列表
//   POST   /admin/workflows                新增
//   PATCH  /admin/workflows/:id            编辑
//   DELETE /admin/workflows/:id            删除
//   POST   /admin/workflows/import-github  GitHub 导入
//   GET    /admin/workflows/review         审核队列
//   POST   /admin/workflows/:id/review     审核（approve|reject）
//   POST   /admin/workflows/:id/approve   通过
//   POST   /admin/workflows/:id/reject    驳回
//   GET    /admin/workflows/stats         统计
//   GET    /admin/workflows/:id/exec-logs 执行日志
//   GET    /admin/workflows/:id/mcp-binds MCP 绑定

import { adminRequest } from './admin-auth-api'

export interface WorkflowBatchDeleteResult {
  total: number
  deleted: number
  failed: number
  errors: string[]
}
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminWorkflowItem,
  AdminWorkflowQuery,
  AdminWorkflowStats,
  CreateAdminWorkflowDto,
  ImportGithubWorkflowDto,
  ImportGithubWorkflowResult,
  UpdateAdminWorkflowDto,
  WorkflowRejectDto,
} from '@/types/admin-workflow'

/** 工作流列表 */
export async function listAdminWorkflows(
  query: AdminWorkflowQuery = {}
): Promise<AdminPaginatedResult<AdminWorkflowItem>> {
  return adminRequest<AdminPaginatedResult<AdminWorkflowItem>>(
    'get',
    '/admin/workflows',
    { params: query as Record<string, unknown> }
  )
}

/** 新增 */
export async function createAdminWorkflow(
  dto: CreateAdminWorkflowDto
): Promise<AdminWorkflowItem> {
  return adminRequest<AdminWorkflowItem>('post', '/admin/workflows', { data: dto })
}

/** 编辑 */
export async function updateAdminWorkflow(
  id: number,
  dto: UpdateAdminWorkflowDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/workflows/${id}`, { data: dto })
}

/** 删除 */
export async function deleteAdminWorkflow(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/workflows/${id}`)
}

/** 本地上传导入工作流（.json / .zip，支持多文件） */
export async function importLocalWorkflows(
  files: File[]
): Promise<{ total?: number; imported: number; failed: number; errors?: string[]; message?: string }> {
  const form = new FormData()
  files.forEach((f) => form.append('files', f))
  return adminRequest<{ total?: number; imported: number; failed: number; errors?: string[]; message?: string }>(
    'post',
    '/admin/workflows/import-local',
    { data: form }
  )
}

/** 批量删除工作流 */
export async function batchDeleteAdminWorkflows(
  ids: number[]
): Promise<WorkflowBatchDeleteResult> {
  return adminRequest<WorkflowBatchDeleteResult>('post', '/admin/workflows/batch-delete', { data: { ids } })
}

/** GitHub 导入 */
/** GitHub 导入 */
export async function importGithubWorkflow(
  dto: ImportGithubWorkflowDto
): Promise<ImportGithubWorkflowResult> {
  return adminRequest<ImportGithubWorkflowResult>(
    'post',
    '/admin/workflows/import-github',
    { data: dto }
  )
}

/** 审核队列 */
export async function listWorkflowReview(
  query: AdminWorkflowQuery = {}
): Promise<AdminPaginatedResult<AdminWorkflowItem>> {
  return adminRequest<AdminPaginatedResult<AdminWorkflowItem>>(
    'get',
    '/admin/workflows/review',
    { params: { ...query, publishStatus: 'pending_review' } as Record<string, unknown> }
  )
}

/** 审核（approve|reject） */
export async function reviewWorkflow(
  id: number,
  action: 'approve' | 'reject',
  reason?: string
): Promise<void> {
  await adminRequest<void>('post', `/admin/workflows/${id}/review`, {
    data: { action, reason },
  })
}

/** 通过 */
export async function approveWorkflow(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/workflows/${id}/approve`)
}

/** 驳回 */
export async function rejectWorkflow(
  id: number,
  dto: WorkflowRejectDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/workflows/${id}/reject`, { data: dto })
}

/** 统计 */
export async function getWorkflowStats(): Promise<AdminWorkflowStats> {
  return adminRequest<AdminWorkflowStats>('get', '/admin/workflows/stats')
}

/** 执行日志 */
export async function getWorkflowExecLogs(
  id: number,
  query: Record<string, unknown> = {}
): Promise<any[]> {
  return adminRequest<any[]>('get', `/admin/workflows/${id}/exec-logs`, {
    params: query,
  })
}

/** MCP 绑定列表 */
export async function getWorkflowMcpBinds(id: number): Promise<any[]> {
  return adminRequest<any[]>('get', `/admin/workflows/${id}/mcp-binds`)
}

/** 创建 MCP 绑定 */
export async function createWorkflowMcpBind(
  id: number,
  body: { mcpResourceId: number; bindType: string; config?: Record<string, unknown> }
): Promise<any> {
  return adminRequest<any>('post', `/admin/workflows/${id}/mcp-binds`, { data: body })
}

/** 删除 MCP 绑定 */
export async function deleteWorkflowMcpBind(bindId: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/workflows/mcp-binds/${bindId}`)
}

export default {
  listAdminWorkflows,
  createAdminWorkflow,
  updateAdminWorkflow,
  deleteAdminWorkflow,
  importGithubWorkflow,
  listWorkflowReview,
  reviewWorkflow,
  approveWorkflow,
  rejectWorkflow,
  getWorkflowStats,
}

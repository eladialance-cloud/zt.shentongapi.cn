// 管理端 Agent 市场管理 API
//
// 端点契约：
//   GET    /admin/agents                          Agent 列表
//   POST   /admin/agents                          新增 Agent
//   PATCH  /admin/agents/:id                      编辑 Agent
//   DELETE /admin/agents/:id                      删除 Agent
//   POST   /admin/agents/:id/publish              上架
//   POST   /admin/agents/:id/unpublish            下架
//   POST   /admin/agents/import-github            GitHub 仓库异步导入
//   GET    /admin/agents/import-github/:taskId    查询导入任务状态
//   GET    /admin/agents/review                   审核队列
//   POST   /admin/agents/:id/approve             通过审核
//   POST   /admin/agents/:id/reject              驳回审核 body: { reason }
//   POST   /admin/agents/:id/force-unpublish     强制下架 body: { reason }
//   GET    /admin/agents/categories              分类列表

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminAgentItem,
  AdminAgentQuery,
  AdminAgentReviewQuery,
  AgentCategoryMeta,
  AgentRejectDto,
  CreateAdminAgentDto,
  ImportGithubDto,
  ImportGithubTask,
  UpdateAdminAgentDto
} from '@/types/admin-agent'

/** Agent 列表 */
export async function listAdminAgents(
  query: AdminAgentQuery = {}
): Promise<AdminPaginatedResult<AdminAgentItem>> {
  return adminRequest<AdminPaginatedResult<AdminAgentItem>>(
    'get',
    '/admin/agents',
    { params: query as Record<string, unknown> }
  )
}

/** 新增 Agent */
export async function createAdminAgent(
  dto: CreateAdminAgentDto
): Promise<AdminAgentItem> {
  return adminRequest<AdminAgentItem>('post', '/admin/agents', { data: dto })
}

/** 编辑 Agent */
export async function updateAdminAgent(
  id: number,
  dto: UpdateAdminAgentDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/agents/${id}`, { data: dto })
}

/** 删除 Agent */
export async function deleteAdminAgent(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/agents/${id}`)
}

/** 上架 Agent */
export async function publishAdminAgent(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/agents/${id}/publish`)
}

/** 下架 Agent */
export async function unpublishAdminAgent(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/agents/${id}/unpublish`)
}

/** GitHub 仓库异步导入 */
export async function importGithubAgent(
  dto: ImportGithubDto
): Promise<{ taskId: string }> {
  return adminRequest<{ taskId: string }>('post', '/admin/agents/import-github', {
    data: dto
  })
}

/** 查询 GitHub 导入任务状态 */
export async function getImportGithubTask(
  taskId: string
): Promise<ImportGithubTask> {
  return adminRequest<ImportGithubTask>(
    'get',
    `/admin/agents/import-github/${taskId}`
  )
}

/** 审核队列列表 */
export async function listAgentReview(
  query: AdminAgentReviewQuery = {}
): Promise<AdminPaginatedResult<AdminAgentItem>> {
  return adminRequest<AdminPaginatedResult<AdminAgentItem>>(
    'get',
    '/admin/agents/review',
    { params: query as Record<string, unknown> }
  )
}

/** 通过审核 */
export async function approveAgent(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/agents/${id}/approve`)
}

/** 驳回审核 */
export async function rejectAgent(
  id: number,
  dto: AgentRejectDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/agents/${id}/reject`, { data: dto })
}

/** 强制下架 */
export async function forceUnpublishAgent(
  id: number,
  dto: AgentRejectDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/agents/${id}/force-unpublish`, {
    data: dto
  })
}

/** 分类列表(含每分类 Agent 数量) */
export async function listAgentCategories(): Promise<AgentCategoryMeta[]> {
  return adminRequest<AgentCategoryMeta[]>('get', '/admin/agents/categories')
}

/** 更新分类显示名 */
export async function updateAgentCategoryDisplay(
  category: string,
  displayName: string
): Promise<void> {
  await adminRequest<void>('patch', `/admin/agents/categories/${category}`, {
    data: { displayName }
  })
}

export default {
  listAdminAgents,
  createAdminAgent,
  updateAdminAgent,
  deleteAdminAgent,
  publishAdminAgent,
  unpublishAdminAgent,
  importGithubAgent,
  getImportGithubTask,
  listAgentReview,
  approveAgent,
  rejectAgent,
  forceUnpublishAgent,
  listAgentCategories,
  updateAgentCategoryDisplay
}

// 管理端工作流模板管理 API
//
// 端点契约：
//   GET    /admin/workflows                        工作流列表
//   POST   /admin/workflows                        新增工作流
//   PATCH  /admin/workflows/:id                    编辑工作流
//   DELETE /admin/workflows/:id                    删除工作流
//   GET    /admin/workflows/review                 审核队列
//   POST   /admin/workflows/:id/approve           通过审核
//   POST   /admin/workflows/:id/reject            驳回审核 body: { reason }
//   GET    /admin/workflows/stats                 统计

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminWorkflowItem,
  AdminWorkflowQuery,
  AdminWorkflowReviewQuery,
  AdminWorkflowStats,
  CreateAdminWorkflowDto,
  UpdateAdminWorkflowDto,
  WorkflowRejectDto
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

/** 新增工作流 */
export async function createAdminWorkflow(
  dto: CreateAdminWorkflowDto
): Promise<AdminWorkflowItem> {
  return adminRequest<AdminWorkflowItem>('post', '/admin/workflows', { data: dto })
}

/** 编辑工作流 */
export async function updateAdminWorkflow(
  id: number,
  dto: UpdateAdminWorkflowDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/workflows/${id}`, { data: dto })
}

/** 删除工作流 */
export async function deleteAdminWorkflow(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/workflows/${id}`)
}

/** 审核队列列表 */
export async function listWorkflowReview(
  query: AdminWorkflowReviewQuery = {}
): Promise<AdminPaginatedResult<AdminWorkflowItem>> {
  return adminRequest<AdminPaginatedResult<AdminWorkflowItem>>(
    'get',
    '/admin/workflows/review',
    { params: query as Record<string, unknown> }
  )
}

/** 通过审核 */
export async function approveWorkflow(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/workflows/${id}/approve`)
}

/** 驳回审核 */
export async function rejectWorkflow(
  id: number,
  dto: WorkflowRejectDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/workflows/${id}/reject`, { data: dto })
}

/** 工作流统计 */
export async function getWorkflowStats(): Promise<AdminWorkflowStats> {
  return adminRequest<AdminWorkflowStats>('get', '/admin/workflows/stats')
}

export default {
  listAdminWorkflows,
  createAdminWorkflow,
  updateAdminWorkflow,
  deleteAdminWorkflow,
  listWorkflowReview,
  approveWorkflow,
  rejectWorkflow,
  getWorkflowStats
}

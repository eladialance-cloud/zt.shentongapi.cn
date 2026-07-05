// 管理端插件管理 API
//
// 端点契约：
//   GET    /admin/plugins                        插件列表
//   POST   /admin/plugins                        新增插件
//   PATCH  /admin/plugins/:id                    编辑插件
//   DELETE /admin/plugins/:id                    删除插件
//   POST   /admin/plugins/:id/publish            上架
//   POST   /admin/plugins/:id/unpublish          下架
//   GET    /admin/plugins/review                 审核队列
//   POST   /admin/plugins/:id/approve           通过审核
//   POST   /admin/plugins/:id/reject            驳回审核 body: { reason }
//   GET    /admin/plugins/sync-status            MCP 同步状态列表
//   POST   /admin/plugins/:id/sync              手动同步

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminPluginItem,
  AdminPluginQuery,
  AdminPluginReviewQuery,
  CreateAdminPluginDto,
  PluginRejectDto,
  PluginSyncQuery,
  PluginSyncStatusItem,
  UpdateAdminPluginDto
} from '@/types/admin-plugin'

/** 插件列表 */
export async function listAdminPlugins(
  query: AdminPluginQuery = {}
): Promise<AdminPaginatedResult<AdminPluginItem>> {
  return adminRequest<AdminPaginatedResult<AdminPluginItem>>(
    'get',
    '/admin/plugins',
    { params: query as Record<string, unknown> }
  )
}

/** 新增插件 */
export async function createAdminPlugin(
  dto: CreateAdminPluginDto
): Promise<AdminPluginItem> {
  return adminRequest<AdminPluginItem>('post', '/admin/plugins', { data: dto })
}

/** 编辑插件 */
export async function updateAdminPlugin(
  id: number,
  dto: UpdateAdminPluginDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/plugins/${id}`, { data: dto })
}

/** 删除插件 */
export async function deleteAdminPlugin(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/plugins/${id}`)
}

/** 上架插件 */
export async function publishAdminPlugin(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/plugins/${id}/publish`)
}

/** 下架插件 */
export async function unpublishAdminPlugin(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/plugins/${id}/unpublish`)
}

/** 审核队列列表 */
export async function listPluginReview(
  query: AdminPluginReviewQuery = {}
): Promise<AdminPaginatedResult<AdminPluginItem>> {
  return adminRequest<AdminPaginatedResult<AdminPluginItem>>(
    'get',
    '/admin/plugins/review',
    { params: query as Record<string, unknown> }
  )
}

/** 通过审核 */
export async function approvePlugin(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/plugins/${id}/approve`)
}

/** 驳回审核 */
export async function rejectPlugin(
  id: number,
  dto: PluginRejectDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/plugins/${id}/reject`, { data: dto })
}

/** MCP 同步状态列表 */
export async function listPluginSyncStatus(
  query: PluginSyncQuery = {}
): Promise<AdminPaginatedResult<PluginSyncStatusItem>> {
  return adminRequest<AdminPaginatedResult<PluginSyncStatusItem>>(
    'get',
    '/admin/plugins/sync-status',
    { params: query as Record<string, unknown> }
  )
}

/** 手动同步插件 */
export async function syncPlugin(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/plugins/${id}/sync`)
}

export default {
  listAdminPlugins,
  createAdminPlugin,
  updateAdminPlugin,
  deleteAdminPlugin,
  publishAdminPlugin,
  unpublishAdminPlugin,
  listPluginReview,
  approvePlugin,
  rejectPlugin,
  listPluginSyncStatus,
  syncPlugin
}

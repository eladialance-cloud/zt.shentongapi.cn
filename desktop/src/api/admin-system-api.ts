// 管理端系统配置 API
//
// 端点契约：
//   GET    /admin/system/config                获取系统配置
//   PUT    /admin/system/config                更新系统配置
//   POST   /admin/system/cache/clear           清空缓存
//   GET    /admin/tenants                      租户列表
//   POST   /admin/tenants                      新增租户
//   PATCH  /admin/tenants/:id                  编辑租户
//   POST   /admin/tenants/:id/suspend          停用/恢复租户
//   GET    /admin/announcements                公告列表
//   POST   /admin/announcements                新增公告
//   PATCH  /admin/announcements/:id            编辑公告
//   POST   /admin/announcements/:id/publish    发布公告
//   POST   /admin/announcements/:id/unpublish  撤回公告
//   DELETE /admin/announcements/:id            删除公告

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  Announcement,
  AnnouncementQuery,
  CacheConfig,
  ClearCacheDto,
  CreateAnnouncementDto,
  CreateTenantDto,
  NotificationConfig,
  RateLimitConfig,
  SystemConfigSection,
  Tenant,
  UpdateAnnouncementDto,
  UpdateSystemConfigDto,
  UpdateTenantDto
} from '@/types/admin-system'

/** 获取系统配置 */
export async function getSystemConfig(
  section: SystemConfigSection
): Promise<Record<string, unknown>> {
  return adminRequest<Record<string, unknown>>('get', '/admin/system/config', {
    params: { section }
  })
}

/** 获取缓存配置(强类型) */
export async function getCacheConfig(): Promise<CacheConfig> {
  return adminRequest<CacheConfig>('get', '/admin/system/config', {
    params: { section: 'cache' }
  })
}

/** 获取限流配置(强类型) */
export async function getRateLimitConfig(): Promise<RateLimitConfig> {
  return adminRequest<RateLimitConfig>('get', '/admin/system/config', {
    params: { section: 'rate_limit' }
  })
}

/** 获取通知配置(强类型) */
export async function getNotificationConfig(): Promise<NotificationConfig> {
  return adminRequest<NotificationConfig>('get', '/admin/system/config', {
    params: { section: 'notification' }
  })
}

/** 更新系统配置 */
export async function updateSystemConfig(
  dto: UpdateSystemConfigDto
): Promise<void> {
  await adminRequest<void>('put', '/admin/system/config', { data: dto })
}

/** 清空缓存 */
export async function clearCache(dto: ClearCacheDto): Promise<void> {
  await adminRequest<void>('post', '/admin/system/cache/clear', { data: dto })
}

/** 租户列表 */
export async function listTenants(
  query: { page?: number; pageSize?: number } = {}
): Promise<AdminPaginatedResult<Tenant>> {
  return adminRequest<AdminPaginatedResult<Tenant>>('get', '/admin/tenants', {
    params: query as Record<string, unknown>
  })
}

/** 新增租户 */
export async function createTenant(dto: CreateTenantDto): Promise<Tenant> {
  return adminRequest<Tenant>('post', '/admin/tenants', { data: dto })
}

/** 编辑租户 */
export async function updateTenant(
  id: number,
  dto: UpdateTenantDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/tenants/${id}`, { data: dto })
}

/** 停用/恢复租户 */
export async function suspendTenant(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/tenants/${id}/suspend`)
}

/** 公告列表 */
export async function listAnnouncements(
  query: AnnouncementQuery = {}
): Promise<AdminPaginatedResult<Announcement>> {
  return adminRequest<AdminPaginatedResult<Announcement>>(
    'get',
    '/admin/announcements',
    { params: query as Record<string, unknown> }
  )
}

/** 新增公告 */
export async function createAnnouncement(
  dto: CreateAnnouncementDto
): Promise<Announcement> {
  return adminRequest<Announcement>('post', '/admin/announcements', { data: dto })
}

/** 编辑公告 */
export async function updateAnnouncement(
  id: number,
  dto: UpdateAnnouncementDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/announcements/${id}`, { data: dto })
}

/** 发布公告 */
export async function publishAnnouncement(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/announcements/${id}/publish`)
}

/** 撤回公告 */
export async function unpublishAnnouncement(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/announcements/${id}/unpublish`)
}

/** 删除公告 */
export async function deleteAnnouncement(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/announcements/${id}`)
}

export default {
  getSystemConfig,
  getCacheConfig,
  getRateLimitConfig,
  getNotificationConfig,
  updateSystemConfig,
  clearCache,
  listTenants,
  createTenant,
  updateTenant,
  suspendTenant,
  listAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  unpublishAnnouncement,
  deleteAnnouncement
}

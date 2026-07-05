// 管理端客户端版本管理 API
//
// 端点契约：
//   GET    /admin/versions                    版本列表
//   POST   /admin/versions                    新增版本
//   PATCH  /admin/versions/:id                编辑版本
//   DELETE /admin/versions/:id                删除版本
//   GET    /admin/versions/latest             最新版本(按平台)
//   GET    /admin/versions/:id/stats          版本统计

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  CreateVersionDto,
  LatestVersion,
  UpdateVersionDto,
  VersionItem,
  VersionQuery,
  VersionStats
} from '@/types/admin-version'

/** 版本列表 */
export async function listVersions(
  query: VersionQuery = {}
): Promise<AdminPaginatedResult<VersionItem>> {
  return adminRequest<AdminPaginatedResult<VersionItem>>(
    'get',
    '/admin/versions',
    { params: query as Record<string, unknown> }
  )
}

/** 新增版本 */
export async function createVersion(dto: CreateVersionDto): Promise<VersionItem> {
  return adminRequest<VersionItem>('post', '/admin/versions', { data: dto })
}

/** 编辑版本 */
export async function updateVersion(
  id: number,
  dto: UpdateVersionDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/versions/${id}`, { data: dto })
}

/** 删除版本 */
export async function deleteVersion(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/versions/${id}`)
}

/** 最新版本(按平台) */
export async function getLatestVersion(
  platform: VersionQuery['platform']
): Promise<LatestVersion | null> {
  const params: Record<string, unknown> = {}
  if (platform) params.platform = platform
  return adminRequest<LatestVersion | null>('get', '/admin/versions/latest', {
    params
  })
}

/** 版本统计 */
export async function getVersionStats(id: number): Promise<VersionStats> {
  return adminRequest<VersionStats>('get', `/admin/versions/${id}/stats`)
}

export default {
  listVersions,
  createVersion,
  updateVersion,
  deleteVersion,
  getLatestVersion,
  getVersionStats
}

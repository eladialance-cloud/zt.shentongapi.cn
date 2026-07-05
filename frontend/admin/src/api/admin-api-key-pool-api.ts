// 管理端 API Key 池管理 API
//
// 端点契约：
//   GET    /admin/api-key-pool                     Key 池列表
//   POST   /admin/api-key-pool                     新增 Key
//   PATCH  /admin/api-key-pool/:id                 编辑 Key
//   DELETE /admin/api-key-pool/:id                 删除 Key
//   POST   /admin/api-key-pool/:id/reset-errors    重置错误计数
//   PATCH  /admin/api-key-pool/:id/limits          更新日/月配额
//   GET    /admin/api-key-pool/stats               状态监控统计

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  ApiKeyPoolItem,
  ApiKeyPoolQuery,
  ApiKeyPoolStats,
  CreateApiKeyDto,
  UpdateApiKeyDto,
  UpdateApiKeyLimitsDto
} from '@/types/admin-api-key-pool'

/** Key 池列表 */
export async function listApiKeyPool(
  query: ApiKeyPoolQuery = {}
): Promise<AdminPaginatedResult<ApiKeyPoolItem>> {
  return adminRequest<AdminPaginatedResult<ApiKeyPoolItem>>(
    'get',
    '/admin/api-key-pool',
    { params: query as Record<string, unknown> }
  )
}

/** 新增 Key */
export async function createApiKey(dto: CreateApiKeyDto): Promise<ApiKeyPoolItem> {
  return adminRequest<ApiKeyPoolItem>('post', '/admin/api-key-pool', {
    data: dto
  })
}

/** 编辑 Key */
export async function updateApiKey(
  id: number,
  dto: UpdateApiKeyDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/api-key-pool/${id}`, { data: dto })
}

/** 删除 Key */
export async function deleteApiKey(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/api-key-pool/${id}`)
}

/** 重置错误计数 */
export async function resetApiKeyErrors(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/api-key-pool/${id}/reset-errors`)
}

/** 更新日/月配额 */
export async function updateApiKeyLimits(
  id: number,
  dto: UpdateApiKeyLimitsDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/api-key-pool/${id}/limits`, {
    data: dto
  })
}

/** 状态监控统计 */
export async function getApiKeyPoolStats(): Promise<ApiKeyPoolStats> {
  return adminRequest<ApiKeyPoolStats>('get', '/admin/api-key-pool/stats')
}

export default {
  listApiKeyPool,
  createApiKey,
  updateApiKey,
  deleteApiKey,
  resetApiKeyErrors,
  updateApiKeyLimits,
  getApiKeyPoolStats
}

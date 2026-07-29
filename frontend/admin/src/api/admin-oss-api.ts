// 管理端 OSS 存储配置管理 API
//
// 端点契约：
//   GET    /admin/oss/configs           配置列表
//   GET    /admin/oss/configs/:id       配置详情
//   POST   /admin/oss/configs           创建配置
//   PATCH  /admin/oss/configs/:id       更新配置
//   DELETE /admin/oss/configs/:id       删除配置
//   POST   /admin/oss/configs/:id/test  测试连接
//   GET    /admin/oss/configs/:id/stats 存储统计

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminOssConfig,
  AdminOssQuery,
  CreateAdminOssConfigDto,
  UpdateAdminOssConfigDto,
  OssTestResult,
  OssStorageStats
} from '@/types/admin-oss'

/** OSS 配置列表 */
export async function listOssConfigs(
  query: AdminOssQuery = {}
): Promise<AdminPaginatedResult<AdminOssConfig>> {
  return adminRequest<AdminPaginatedResult<AdminOssConfig>>(
    'get',
    '/admin/oss/configs',
    { params: query as Record<string, unknown> }
  )
}

/** OSS 配置详情 */
export async function getOssConfig(
  id: number
): Promise<AdminOssConfig> {
  return adminRequest<AdminOssConfig>('get', `/admin/oss/configs/${id}`)
}

/** 创建 OSS 配置 */
export async function createOssConfig(
  dto: CreateAdminOssConfigDto
): Promise<AdminOssConfig> {
  return adminRequest<AdminOssConfig>('post', '/admin/oss/configs', {
    data: dto
  })
}

/** 更新 OSS 配置 */
export async function updateOssConfig(
  id: number,
  dto: UpdateAdminOssConfigDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/oss/configs/${id}`, {
    data: dto
  })
}

/** 删除 OSS 配置 */
export async function deleteOssConfig(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/oss/configs/${id}`)
}

/** 测试 OSS 连接 */
export async function testOssConnection(
  id: number
): Promise<OssTestResult> {
  return adminRequest<OssTestResult>(
    'post',
    `/admin/oss/configs/${id}/test`
  )
}

/** 获取存储统计 */
export async function getOssStorageStats(
  id: number
): Promise<OssStorageStats> {
  return adminRequest<OssStorageStats>(
    'get',
    `/admin/oss/configs/${id}/stats`
  )
}

export default {
  listOssConfigs,
  getOssConfig,
  createOssConfig,
  updateOssConfig,
  deleteOssConfig,
  testOssConnection,
  getOssStorageStats
}

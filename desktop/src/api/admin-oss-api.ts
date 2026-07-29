//
// POST   /admin/oss/configs          新增 OSS 配置

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  OssConfig,
  OssConfigQuery,
  OssStorageStats,
  OssTestResult,
  CreateOssConfigDto,
  UpdateOssConfigDto
} from '@/types/admin-oss'

export async function listOssConfigs(
  query: OssConfigQuery = {}
): Promise<AdminPaginatedResult<OssConfig>> {
  return adminRequest<AdminPaginatedResult<OssConfig>>(
    'get',
    '/admin/oss/configs',
    { params: query as Record<string, unknown> }
  )
}

export async function getOssConfig(id: number): Promise<OssConfig> {
  return adminRequest<OssConfig>('get', `/admin/oss/configs/${id}`)
}

/** 新增 OSS 配置 */
export async function createOssConfig(
  dto: CreateOssConfigDto
): Promise<OssConfig> {
  return adminRequest<OssConfig>('post', '/admin/oss/configs', { data: dto })
}

export async function updateOssConfig(
  id: number,
  dto: UpdateOssConfigDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/oss/configs/${id}`, { data: dto })
}

export async function deleteOssConfig(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/oss/configs/${id}`)
}

export async function testOssConnection(id: number): Promise<OssTestResult> {
  return adminRequest<OssTestResult>('post', `/admin/oss/configs/${id}/test`)
}

export async function getOssStats(id: number): Promise<OssStorageStats> {
  return adminRequest<OssStorageStats>('get', `/admin/oss/configs/${id}/stats`)
}

export default {
  listOssConfigs,
  getOssConfig,
  createOssConfig,
  updateOssConfig,
  deleteOssConfig,
  testOssConnection,
  getOssStats
}

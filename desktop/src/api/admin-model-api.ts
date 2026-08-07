// 管理端大模型配置 API
//
// 端点契约：
//   GET    /admin/models                        模型列表
//   POST   /admin/models                        新增模型
//   PATCH  /admin/models/:id                    编辑模型
//   POST   /admin/models/:id/sync              手动同步 OpenClaw

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminModelItem,
  AdminModelQuery,
  CreateAdminModelDto,
  FetchModelsDto,
  FetchModelsResult,
  ImportModelsDto,
  ImportModelsResult,
  UpdateAdminModelDto
} from '@/types/admin-model'

/** 模型列表 */
export async function listAdminModels(
  query: AdminModelQuery = {}
): Promise<AdminPaginatedResult<AdminModelItem>> {
  return adminRequest<AdminPaginatedResult<AdminModelItem>>(
    'get',
    '/admin/models',
    { params: query as Record<string, unknown> }
  )
}

/** 新增模型 */
export async function createAdminModel(
  dto: CreateAdminModelDto
): Promise<AdminModelItem> {
  return adminRequest<AdminModelItem>('post', '/admin/models', { data: dto })
}

/** 编辑模型 */
export async function updateAdminModel(
  id: number,
  dto: UpdateAdminModelDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/models/${id}`, { data: dto })
}

/** 手动同步 OpenClaw */
export async function syncAdminModel(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/models/${id}/sync`)
}


/** 拉取上游模型列表 POST /admin/models/proxy/fetch-models */
export async function fetchUpstreamModels(
  dto: FetchModelsDto
): Promise<FetchModelsResult> {
  return adminRequest<FetchModelsResult>(
    'post',
    '/admin/models/proxy/fetch-models',
    { data: dto }
  )
}

/** 批量导入上游模型 POST /admin/models/proxy/import */
export async function importModels(
  dto: ImportModelsDto
): Promise<ImportModelsResult> {
  return adminRequest<ImportModelsResult>(
    'post',
    '/admin/models/proxy/import',
    { data: dto }
  )
}
export default {
  listAdminModels,
  createAdminModel,
  updateAdminModel,
  syncAdminModel,
  fetchUpstreamModels,
  importModels
}

// 管理端大模型配置 API
//
// 端点契约：
//   GET    /admin/models                            模型列表
//   PATCH  /admin/models/:id                        编辑模型
//   DELETE /admin/models/:id                        删除模型
//   POST   /admin/models/:id/enable                 上架
//   POST   /admin/models/:id/disable                下架
//   POST   /admin/models/:id/test                   测试模型
//   GET    /admin/models/providers                  供应商列表
//   POST   /admin/models/providers                  新增供应商
//   PATCH  /admin/models/providers/:id              编辑供应商
//   DELETE /admin/models/providers/:id              删除供应商
//   POST   /admin/models/providers/test             测试供应商连接
//   POST   /admin/models/providers/:id/fetch-models 读取上游模型列表
//   POST   /admin/models/providers/:id/import       勾选逐模型定价导入
import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminModelItem,
  AdminModelQuery,
  AdminProviderItem,
  CreateProviderDto,
  FetchProviderModelsResult,
  ImportProviderModelsDto,
  ImportProviderModelsResult,
  TestProviderDto,
  TestProviderResult,
  UpdateAdminModelDto,
  UpdateProviderDto
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

/** 编辑模型 */
export async function updateAdminModel(
  id: number,
  dto: UpdateAdminModelDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/models/${id}`, { data: dto })
}

/** 删除模型 */
export async function removeAdminModel(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/models/${id}`)
}

/** 上架模型 */
export async function enableAdminModel(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/models/${id}/enable`)
}

/** 下架模型 */
export async function disableAdminModel(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/models/${id}/disable`)
}

/** 测试模型 */
export async function testModel(
  id: number,
  input = 'Hello'
): Promise<{ success: boolean; response: string }> {
  return adminRequest<{ success: boolean; response: string }>(
    'post',
    `/admin/models/${id}/test`,
    { data: { input } }
  )
}

// ===== 供应商 =====  

/** 供应商列表 */
export async function listAdminProviders(): Promise<AdminProviderItem[]> {
  return adminRequest<AdminProviderItem[]>('get', '/admin/models/providers')
}

/** 新增供应商 */
export async function createAdminProvider(
  dto: CreateProviderDto
): Promise<AdminProviderItem> {
  return adminRequest<AdminProviderItem>('post', '/admin/models/providers', {
    data: dto
  })
}

/** 编辑供应商 */
export async function updateAdminProvider(
  id: number,
  dto: UpdateProviderDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/models/providers/${id}`, {
    data: dto
  })
}

/** 删除供应商 */
export async function removeAdminProvider(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/models/providers/${id}`)
}

/** 测试供应商连接（可未保存直接测） */
export async function testAdminProvider(
  dto: TestProviderDto
): Promise<TestProviderResult> {
  return adminRequest<TestProviderResult>(
    'post',
    '/admin/models/providers/test',
    { data: dto }
  )
}

/** 读取上游模型列表 */
export async function fetchProviderModels(
  providerId: number
): Promise<FetchProviderModelsResult> {
  return adminRequest<FetchProviderModelsResult>(
    'post',
    `/admin/models/providers/${providerId}/fetch-models`
  )
}

/** 勾选逐模型定价导入 */
export async function importProviderModels(
  providerId: number,
  dto: ImportProviderModelsDto
): Promise<ImportProviderModelsResult> {
  return adminRequest<ImportProviderModelsResult>(
    'post',
    `/admin/models/providers/${providerId}/import`,
    { data: dto }
  )
}

export default {
  listAdminModels,
  updateAdminModel,
  removeAdminModel,
  enableAdminModel,
  disableAdminModel,
  testModel,
  listAdminProviders,
  createAdminProvider,
  updateAdminProvider,
  removeAdminProvider,
  testAdminProvider,
  fetchProviderModels,
  importProviderModels
}

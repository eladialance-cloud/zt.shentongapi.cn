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
  BatchUpdateResult,
  CallModesMeta,
  CreateAdminModelDto,
  CreateProviderDto,
  FetchProviderModelsResult,
  ImportModelsJsonResult,
  ImportProviderModelsDto,
  ImportProviderModelsResult,
  MarketImportItem,
  MarketImportResult,
  MarketPresetItem,
  MarketVendor,
  ModelTemplateItem,
  ProviderBalanceResult,
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

/** 新增模型（单模型添加窗口；P2 全字段） */
export async function createAdminModel(
  dto: CreateAdminModelDto
): Promise<AdminModelItem> {
  return adminRequest<AdminModelItem>('post', '/admin/models', {
    data: dto
  })
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

/** 测试模型（图像编辑可传参考图 URL） */
export async function testModel(
  id: number,
  input = 'Hello',
  inputImage?: string
): Promise<{ success: boolean; response: string }> {
  return adminRequest<{ success: boolean; response: string }>(
    'post',
    `/admin/models/${id}/test`,
    { data: { input, ...(inputImage ? { inputImages: [inputImage] } : {}) } }
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

// ===== P2：动态表单 / 模板 / 批量 / 余额 =====

/** 动态表单元数据（14 模式 + 规格 schema + 场景标签 + 能力标签） */
export async function fetchCallModesMeta(): Promise<CallModesMeta> {
  return adminRequest<CallModesMeta>('get', '/admin/models/call-modes')
}

/** 模板库列表 */
export async function listModelTemplates(): Promise<ModelTemplateItem[]> {
  return adminRequest<ModelTemplateItem[]>('get', '/admin/models/templates')
}

/** 从模板创建模型（默认下架） */
export async function createModelFromTemplate(dto: {
  templateKey: string
  modelId?: string
  displayName?: string
  providerId?: number
  enabled?: boolean
  scenarioTags?: string[]
  priceOverrides?: Record<string, unknown>
}): Promise<AdminModelItem> {
  return adminRequest<AdminModelItem>('post', '/admin/models/from-template', { data: dto })
}

/** 批量上架/下架 */
export async function batchEnableModels(dto: {
  ids: number[]
  enabled: boolean
}): Promise<BatchUpdateResult> {
  return adminRequest<BatchUpdateResult>('post', '/admin/models/batch-enable', { data: dto })
}

/** 批量改价 */
export async function batchUpdateModelPrice(dto: {
  ids: number[]
  pricePerCall?: number
  pricePerImage?: number
  pricePerMinute?: number
  inputPricePerToken?: number
  outputPricePerToken?: number
  videoPerSecond?: Record<string, number>
}): Promise<BatchUpdateResult> {
  return adminRequest<BatchUpdateResult>('post', '/admin/models/batch-price', { data: dto })
}

/** 导出配置 JSON */
export async function exportModels(
  query?: AdminModelQuery
): Promise<AdminModelItem[]> {
  return adminRequest<AdminModelItem[]>(
    'get',
    '/admin/models/export',
    { params: query as Record<string, unknown> }
  )
}

/** 批量导入配置 JSON */
export async function importModelsJson(
  items: Array<Record<string, unknown>>
): Promise<ImportModelsJsonResult> {
  return adminRequest<ImportModelsJsonResult>(
    'post',
    '/admin/models/import',
    { data: { items } }
  )
}

/** 立即检查供应商余额 */
export async function checkProviderBalance(
  providerId: number
): Promise<ProviderBalanceResult> {
  return adminRequest<ProviderBalanceResult>(
    'post',
    `/admin/models/providers/${providerId}/check-balance`
  )
}

// ===== 模型市场（P1）=====

/** 模型市场：厂商列表（含是否已创建供应商） */
export async function fetchMarketVendors(): Promise<MarketVendor[]> {
  return adminRequest<MarketVendor[]>('get', '/admin/models/market/vendors')
}

/** 模型市场：某厂商预设列表 */
export async function fetchMarketPresets(
  vendor: string,
  type?: string
): Promise<MarketPresetItem[]> {
  return adminRequest<MarketPresetItem[]>('get', '/admin/models/market/presets', {
    params: { vendor, ...(type ? { type } : {}) }
  })
}

/** 模型市场：批量创建模型 */
export async function marketImportModels(dto: {
  providerId: number
  items: MarketImportItem[]
}): Promise<MarketImportResult> {
  return adminRequest<MarketImportResult>('post', '/admin/models/market/import', {
    data: dto
  })
}

export default {
  listAdminModels,
  createAdminModel,
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
  importProviderModels,
  fetchCallModesMeta,
  listModelTemplates,
  createModelFromTemplate,
  batchEnableModels,
  batchUpdateModelPrice,
  exportModels,
  importModelsJson,
  checkProviderBalance,
  fetchMarketVendors,
  fetchMarketPresets,
  marketImportModels
}

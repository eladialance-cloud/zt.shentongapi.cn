// 管理端大模型配置 API
//
// 端点契约：//   GET    /admin/models                        模型列表
//   POST   /admin/models                        新增模型
//   PATCH  /admin/models/:id                    编辑模型
//   POST   /admin/models/:id/sync              手动同步 OpenClaw
//   POST   /admin/models/proxy/fetch-models    拉取中转站上游模型列表
//   POST   /admin/models/proxy/import          批量导入中转站模型
import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminModelItem,
  AdminModelQuery,
  CreateAdminModelDto,
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

// ===== 中转站批量导入(Task 6) =====

/** 中转站上游模型(拉取得到的模型项) */
export interface UpstreamModel {
  /** 模型 ID */
  modelId: string
  /** 所属(provider/owner) */
  ownedBy?: string
  /** 上游输入价格(积分/千token) */
  upstreamInputPrice?: number
  /** 上游输出价格(积分/千token) */
  upstreamOutputPrice?: number
  /** 是否已在系统中导入*/
  alreadyExists: boolean
}

/** 加价模式 */
export type PricingMode = 'multiplier' | 'fixed' | 'flat'

/** 加价配置(按模式取对应字段) */
export interface PricingConfig {
  /** 固定加价-输入(积分/千token) */
  fixedInputAdd?: number
  /** 固定加价-输出(积分/千token) */
  fixedOutputAdd?: number
  /** 倍率(如 1.5 表示加价 50%) */
  multiplier?: number
  /** 统一价格-输入(积分/千token) */
  flatInputPrice?: number
  /** 统一价格-输出(积分/千token) */
  flatOutputPrice?: number
}

/** 待导入的单个模型项*/
export interface ImportModelItem {
  modelId: string
  displayName?: string
  upstreamInputPrice?: number
  upstreamOutputPrice?: number
}

/** 拉取上游模型请求 DTO */
export interface FetchModelsDto {
  apiEndpoint: string
  apiKey: string
}

/** 批量导入模型请求 DTO */
export interface ImportModelsDto {
  apiEndpoint: string
  apiKey: string
  models: ImportModelItem[]
  pricingMode: PricingMode
  multiplier?: number
  fixedInputAdd?: number
  fixedOutputAdd?: number
  flatInputPrice?: number
  flatOutputPrice?: number
}

/** 拉取上游模型响应 */
export interface FetchModelsResult {
  success: boolean
  models: UpstreamModel[]
}

/** 批量导入模型响应 */
export interface ImportModelsResult {
  imported: number
  skipped: number
  errors: Array<{ modelId: string; error: string }>
}

/**
 * 拉取中转站上游模型列表
 * POST /admin/models/proxy/fetch-models  body: { apiEndpoint, apiKey }
 */
export async function fetchUpstreamModels(
  dto: FetchModelsDto
): Promise<FetchModelsResult> {
  return adminRequest<FetchModelsResult>(
    'post',
    '/admin/models/proxy/fetch-models',
    { data: dto }
  )
}

/**
 * 批量导入中转站模型
 * POST /admin/models/proxy/import  body: ImportModelsDto
 */

/** 测试模型连接 */
export async function testModel(
  id: number,
  input: string = 'Hello'
): Promise<{ success: boolean; response: string }> {
  return adminRequest<{ success: boolean; response: string }>(
    'post',
    `/admin/models/${id}/test`,
    { data: { input } }
  )
}
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
  importModels,
  testModel
}

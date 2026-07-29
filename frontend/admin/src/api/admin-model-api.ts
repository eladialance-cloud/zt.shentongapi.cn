// 绠＄悊绔ぇ妯″瀷閰嶇疆 API
//
// 绔偣濂戠害锛?//   GET    /admin/models                        妯″瀷鍒楄〃
//   POST   /admin/models                        鏂板妯″瀷
//   PATCH  /admin/models/:id                    缂栬緫妯″瀷
//   POST   /admin/models/:id/sync              鎵嬪姩鍚屾 OpenClaw
//   POST   /admin/models/proxy/fetch-models    鎷夊彇涓浆绔欎笂娓告ā鍨嬪垪琛?//   POST   /admin/models/proxy/import          鎵归噺瀵煎叆涓浆绔欐ā鍨?
import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminModelItem,
  AdminModelQuery,
  CreateAdminModelDto,
  UpdateAdminModelDto
} from '@/types/admin-model'

/** 妯″瀷鍒楄〃 */
export async function listAdminModels(
  query: AdminModelQuery = {}
): Promise<AdminPaginatedResult<AdminModelItem>> {
  return adminRequest<AdminPaginatedResult<AdminModelItem>>(
    'get',
    '/admin/models',
    { params: query as Record<string, unknown> }
  )
}

/** 鏂板妯″瀷 */
export async function createAdminModel(
  dto: CreateAdminModelDto
): Promise<AdminModelItem> {
  return adminRequest<AdminModelItem>('post', '/admin/models', { data: dto })
}

/** 缂栬緫妯″瀷 */
export async function updateAdminModel(
  id: number,
  dto: UpdateAdminModelDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/models/${id}`, { data: dto })
}

/** 鎵嬪姩鍚屾 OpenClaw */
export async function syncAdminModel(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/models/${id}/sync`)
}

// ===== 涓浆绔欐壒閲忓鍏?(Task 6) =====

/** 涓浆绔欎笂娓告ā鍨?鎷夊彇寰楀埌鐨勬ā鍨嬮」) */
export interface UpstreamModel {
  /** 妯″瀷 ID */
  modelId: string
  /** 鎵€灞?provider/owner) */
  ownedBy?: string
  /** 涓婃父杈撳叆浠锋牸(鍏?鍗?token) */
  upstreamInputPrice?: number
  /** 涓婃父杈撳嚭浠锋牸(鍏?鍗?token) */
  upstreamOutputPrice?: number
  /** 鏄惁宸插湪绯荤粺涓鍏?*/
  alreadyExists: boolean
}

/** 鍔犱环妯″紡 */
export type PricingMode = 'multiplier' | 'fixed' | 'flat'

/** 鍔犱环閰嶇疆(鎸夋ā寮忓彇瀵瑰簲瀛楁) */
export interface PricingConfig {
  /** 鍥哄畾鍔犱环-杈撳叆(绉垎/鍗?token) */
  fixedInputAdd?: number
  /** 鍥哄畾鍔犱环-杈撳嚭(绉垎/鍗?token) */
  fixedOutputAdd?: number
  /** 鍊嶇巼(濡?1.5 琛ㄧず鍔犱环 50%) */
  multiplier?: number
  /** 缁熶竴浠锋牸-杈撳叆(绉垎/鍗?token) */
  flatInputPrice?: number
  /** 缁熶竴浠锋牸-杈撳嚭(绉垎/鍗?token) */
  flatOutputPrice?: number
}

/** 寰呭鍏ョ殑鍗曚釜妯″瀷椤?*/
export interface ImportModelItem {
  modelId: string
  displayName?: string
  upstreamInputPrice?: number
  upstreamOutputPrice?: number
}

/** 鎷夊彇涓婃父妯″瀷璇锋眰 DTO */
export interface FetchModelsDto {
  apiEndpoint: string
  apiKey: string
}

/** 鎵归噺瀵煎叆妯″瀷璇锋眰 DTO */
export interface ImportModelsDto {
  apiEndpoint: string
  apiKey: string
  models: ImportModelItem[]
  pricingMode: PricingMode
  pricingConfig: PricingConfig
}

/** 鎷夊彇涓婃父妯″瀷鍝嶅簲 */
export interface FetchModelsResult {
  success: boolean
  models: UpstreamModel[]
}

/** 鎵归噺瀵煎叆妯″瀷鍝嶅簲 */
export interface ImportModelsResult {
  imported: number
  skipped: number
  errors: Array<{ modelId: string; error: string }>
}

/**
 * 鎷夊彇涓浆绔欎笂娓告ā鍨嬪垪琛? * POST /admin/models/proxy/fetch-models  body: { apiEndpoint, apiKey }
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
 * 鎵归噺瀵煎叆涓浆绔欐ā鍨? * POST /admin/models/proxy/import  body: ImportModelsDto
 */
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

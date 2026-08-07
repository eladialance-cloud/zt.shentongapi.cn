// 管理端大模型配置模块类型定义
// v0.7.0+：供应商体系（添加第三方供应商 -> 读取模型 -> 勾选 -> 逐模型定价 -> 导入）

import type { AdminPaginatedResult } from './admin-auth'

/** 连接状态 */
export type ConnectionStatus = 'untested' | 'connected' | 'failed'

/** 模型能力 */
export type ModelCapability =
  | 'vision'
  | 'function_calling'
  | 'streaming'
  | 'reasoning'
  | 'json_mode'

/** 模型类型标签（可修改） */
export type ModelType = 'chat' | 'reasoning' | 'image' | 'embedding' | 'audio' | string

/** 用户等级 */
export type MinUserLevel = 1 | 2 | 3 | 4 | 5

/** 模型配置项 */
export interface AdminModelItem {
  id: number
  /** 所属供应商 ID */
  providerId: number | null
  /** 供应商 slug */
  provider: string
  /** 供应商显示名 */
  providerName: string
  /** 模型 ID(unique) */
  modelId: string
  /** 真正发送给上游 API 的模型名 */
  upstreamModelId: string
  /** 分类标签 */
  modelType: ModelType
  /** 显示名 */
  displayName: string
  apiKeyMasked?: string
  apiEndpoint?: string
  connectionStatus?: ConnectionStatus
  lastTestedAt?: string
  /** 输入单价(积分/千token) */
  inputPricePerToken: number
  /** 输出单价(积分/千token) */
  outputPricePerToken: number
  minUserLevel: MinUserLevel
  enabled: boolean
  syncStatus: 'pending' | 'synced' | 'failed'
  syncErrorMessage?: string
  capabilities: ModelCapability[]
  concurrencyLimit?: number
  rateLimitPerMinute?: number
  lastSyncedAt?: string
  createdAt: string
  updatedAt: string
}

/** 模型查询参数 */
export interface AdminModelQuery {
  provider?: string | ''
  enabled?: boolean | ''
  keyword?: string
  page?: number
  pageSize?: number
}

/** 供应商状态 */
export type ProviderStatus = 'active' | 'disabled'

/** 第三方 API 供应商 */
export interface AdminProviderItem {
  id: number
  name: string
  slug: string
  baseUrl: string
  apiKeyMasked?: string
  hasApiKey: boolean
  config?: Record<string, unknown> | null
  status: ProviderStatus
  connectionStatus: ConnectionStatus
  lastTestedAt?: string
  isBuiltin: boolean
  modelCount: number
  createdAt: string
  updatedAt: string
}

/** 新增供应商 DTO */
export interface CreateProviderDto {
  name: string
  baseUrl: string
  apiKey?: string
  config?: Record<string, unknown>
}

/** 更新供应商 DTO */
export interface UpdateProviderDto {
  name?: string
  baseUrl?: string
  apiKey?: string
  config?: Record<string, unknown>
  status?: ProviderStatus
}

/** 测试供应商 DTO */
export interface TestProviderDto {
  providerId?: number
  baseUrl?: string
  apiKey?: string
  model?: string
}

/** 测试结果 */
export interface TestProviderResult {
  success: boolean
  providerId: number | null
  response: string
}

/** 上游模型项（读取模型列表结果） */
export interface UpstreamModel {
  modelId: string
  ownedBy?: string
  upstreamInputPrice?: number
  upstreamOutputPrice?: number
  alreadyExists: boolean
}

/** 读取上游模型结果 */
export interface FetchProviderModelsResult {
  provider: AdminProviderItem
  models: UpstreamModel[]
}

/** 勾选导入的单个模型（逐模型定价 + 模型类型） */
export interface ImportProviderModelItem {
  /** 上游模型 ID（实际发送） */
  upstreamModelId: string
  displayName?: string
  modelType?: ModelType
  /** 最终输入单价(积分/千token) */
  inputPricePer1k?: number
  /** 最终输出单价(积分/千token) */
  outputPricePer1k?: number
  capabilities?: ModelCapability[]
  enabled?: boolean
}

/** 勾选导入 DTO */
export interface ImportProviderModelsDto {
  models: ImportProviderModelItem[]
}

/** 导入结果 */
export interface ImportProviderModelsResult {
  imported: number
  skipped: number
  errors: Array<{ modelId: string; error: string }>
}

/** 新增模型 DTO（兼容旧接口，新流程请用供应商导入） */
export interface CreateAdminModelDto {
  provider: string
  modelId: string
  displayName: string
  apiKey?: string
  apiEndpoint?: string
  inputPricePerToken?: number
  outputPricePerToken?: number
  capabilities: ModelCapability[]
  enabled: boolean
  concurrencyLimit?: number
  rateLimitPerMinute?: number
  minUserLevel: MinUserLevel
  providerId?: number
  modelType?: ModelType
  upstreamModelId?: string
}

/** 更新模型 DTO */
export interface UpdateAdminModelDto {
  provider?: string
  modelId?: string
  displayName?: string
  apiKey?: string
  apiEndpoint?: string
  inputPricePerToken?: number
  outputPricePerToken?: number
  capabilities?: ModelCapability[]
  enabled?: boolean
  concurrencyLimit?: number
  rateLimitPerMinute?: number
  minUserLevel?: MinUserLevel
  modelType?: ModelType
  upstreamModelId?: string
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

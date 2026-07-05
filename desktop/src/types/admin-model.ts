// 管理端大模型配置模块类型定义
// 数据合同真源：Task 23 - 大模型配置

import type { AdminPaginatedResult } from './admin-auth'

/** 模型 Provider */
export type ModelProvider =
  | 'openai'
  | 'doubao'
  | 'qwen'
  | 'deepseek'
  | 'other'

/** 模型同步状态(OpenClaw) */
export type ModelSyncStatus = 'pending' | 'synced' | 'failed'

/** 模型能力 */
export type ModelCapability =
  | 'vision'
  | 'function_calling'
  | 'streaming'
  | 'reasoning'
  | 'json_mode'

/** 用户等级(与现有等级体系一致) */
export type MinUserLevel = 1 | 2 | 3 | 4 | 5

/** 模型配置项 */
export interface AdminModelItem {
  id: number
  provider: ModelProvider
  /** 模型 ID(unique) */
  modelId: string
  /** 显示名 */
  displayName: string
  /** AES 加密后的 apiKey(后端存储,前端不回显明文) */
  apiKeyMasked?: string
  /** API Endpoint */
  apiEndpoint?: string
  /** 输入单价(每千 token,decimal) */
  inputPricePerToken: number
  /** 输出单价(每千 token,decimal) */
  outputPricePerToken: number
  /** 最低用户等级 */
  minUserLevel: MinUserLevel
  /** 是否启用 */
  enabled: boolean
  /** 同步状态 */
  syncStatus: ModelSyncStatus
  /** 同步错误信息 */
  syncErrorMessage?: string
  /** 模型能力 */
  capabilities: ModelCapability[]
  /** 并发上限 */
  concurrencyLimit?: number
  /** 每分钟速率限制 */
  rateLimitPerMinute?: number
  /** 最后同步时间 */
  lastSyncedAt?: string
  createdAt: string
  updatedAt: string
}

/** 模型查询参数 */
export interface AdminModelQuery {
  provider?: ModelProvider | ''
  enabled?: boolean | ''
  page?: number
  pageSize?: number
}

/** 新增模型 DTO */
export interface CreateAdminModelDto {
  provider: ModelProvider
  modelId: string
  displayName: string
  /** 明文 apiKey(后端 AES 加密存储) */
  apiKey?: string
  apiEndpoint?: string
  inputPricePerToken: number
  outputPricePerToken: number
  capabilities: ModelCapability[]
  enabled: boolean
  concurrencyLimit?: number
  rateLimitPerMinute?: number
  minUserLevel: MinUserLevel
}

/** 更新模型 DTO */
export interface UpdateAdminModelDto {
  provider?: ModelProvider
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
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

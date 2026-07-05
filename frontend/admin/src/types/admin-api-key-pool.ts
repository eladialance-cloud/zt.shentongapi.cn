// 管理端 API Key 池管理模块类型定义
// 数据合同真源：Task 19 - API Key 池管理

import type { AdminPaginatedResult } from './admin-auth'

/** Key 所属供应商 */
export type ApiKeyProvider =
  | 'openai'
  | 'doubao'
  | 'qwen'
  | 'deepseek'
  | 'other'

/** Key 状态 */
export type ApiKeyStatus =
  | 'active'
  | 'exhausted'
  | 'error'
  | 'disabled'

/** API Key 池条目 */
export interface ApiKeyPoolItem {
  id: number
  alias: string
  provider: ApiKeyProvider
  /** 优先级(数字越大越优先) */
  priority: number
  status: ApiKeyStatus
  /** 总额度(积分或调用次数) */
  totalQuota: number
  /** 已用 */
  usedQuota: number
  /** 剩余 */
  remainingQuota: number
  /** 日配额上限 */
  dailyQuota?: number
  /** 月配额上限 */
  monthlyQuota?: number
  /** 最后使用时间 ISO 8601 */
  lastUsedAt?: string
  /** 最后检查时间 ISO 8601 */
  lastCheckedAt?: string
  /** 错误次数 */
  errorCount: number
  createdAt: string
  updatedAt: string
}

/** Key 池查询参数 */
export interface ApiKeyPoolQuery {
  provider?: ApiKeyProvider
  status?: ApiKeyStatus
  page?: number
  pageSize?: number
}

/** 新增 Key DTO */
export interface CreateApiKeyDto {
  provider: ApiKeyProvider
  apiKey: string
  alias: string
  priority: number
  totalQuota: number
}

/** 更新 Key DTO(不含 apiKey) */
export interface UpdateApiKeyDto {
  provider?: ApiKeyProvider
  alias?: string
  priority?: number
  totalQuota?: number
  /** 状态(用于启用/禁用切换) */
  status?: ApiKeyStatus
}

/** 更新配额限制 DTO */
export interface UpdateApiKeyLimitsDto {
  dailyQuota: number
  monthlyQuota: number
}

/** Key 池统计 */
export interface ApiKeyPoolStats {
  total: number
  active: number
  exhausted: number
  error: number
  /** 按 Provider 分组统计 */
  byProvider: Array<{
    provider: ApiKeyProvider
    total: number
    active: number
    used: number
    remaining: number
  }>
  /** 今日消耗 */
  todayConsumed: number
  /** 本月消耗 */
  monthConsumed: number
  /** 异常 Key 列表(error_count >= 5) */
  abnormalKeys: ApiKeyPoolItem[]
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

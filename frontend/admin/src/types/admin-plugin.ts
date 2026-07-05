// 管理端插件管理模块类型定义
// 数据合同真源：Task 22 - 插件管理

import type { AdminPaginatedResult } from './admin-auth'

/** 插件类型 */
export type AdminPluginType =
  | 'tool'
  | 'connector'
  | 'knowledge_base'
  | 'workflow'

/** 插件状态 */
export type AdminPluginStatus = 'published' | 'unpublished'

/** 插件审核状态 */
export type PluginReviewStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'

/** 插件定价模式 */
export type PluginPricingMode = 'perCall' | 'perToken'

/** 插件 MCP 同步状态 */
export type PluginSyncStatus = 'pending' | 'synced' | 'failed'

/** 沙箱配置 */
export interface SandboxConfig {
  /** 内存上限(MB) */
  memoryLimit: number
  /** 超时(ms) */
  timeout: number
  /** CPU 限制(%) */
  cpuLimit: number
}

/** 安全检查结果 */
export interface SecurityCheckResult {
  /** 是否通过 */
  passed: boolean
  /** 漏洞扫描结果 */
  vulnerabilityScan?: {
    passed: boolean
    details?: string
  }
  /** XSS 检测 */
  xssCheck?: {
    passed: boolean
    details?: string
  }
  /** SQL 注入检测 */
  sqliCheck?: {
    passed: boolean
    details?: string
  }
}

/** 性能检查结果 */
export interface PerformanceCheckResult {
  /** 平均耗时(ms) */
  avgDurationMs: number
  /** 内存占用(MB) */
  memoryUsageMb: number
  /** 是否通过 */
  passed: boolean
}

/** 插件项 */
export interface AdminPluginItem {
  id: number
  name: string
  description: string
  type: AdminPluginType
  version: string
  /** 入口 */
  entryPoint?: string
  /** 沙箱配置 */
  sandboxConfig?: SandboxConfig
  /** 状态 */
  status: AdminPluginStatus
  /** 审核状态 */
  reviewStatus?: PluginReviewStatus
  /** 创作者 */
  creatorName?: string
  /** 是否官方 */
  isOfficial: boolean
  /** 定价模式 */
  pricingMode: PluginPricingMode
  /** 每次调用价格(积分) */
  pricePerCall: number
  /** 输入 Token 单价 */
  pricePerTokenInput: number
  /** 输出 Token 单价 */
  pricePerTokenOutput: number
  /** 调用次数 */
  callCount: number
  /** 安全检查结果 */
  securityCheck?: SecurityCheckResult
  /** 性能检查结果 */
  performanceCheck?: PerformanceCheckResult
  /** 驳回原因 */
  rejectReason?: string
  createdAt: string
  updatedAt: string
}

/** 插件 MCP 同步状态项 */
export interface PluginSyncStatusItem {
  id: number
  name: string
  type: AdminPluginType
  syncStatus: PluginSyncStatus
  /** 最后同步时间 ISO 8601 */
  lastSyncedAt?: string
  /** 错误信息 */
  errorMessage?: string
}

/** 插件查询参数 */
export interface AdminPluginQuery {
  type?: AdminPluginType | ''
  status?: AdminPluginStatus | ''
  page?: number
  pageSize?: number
}

/** 插件审核查询参数 */
export interface AdminPluginReviewQuery {
  status?: PluginReviewStatus | ''
  page?: number
  pageSize?: number
}

/** 插件同步状态查询参数 */
export interface PluginSyncQuery {
  status?: PluginSyncStatus | ''
  page?: number
  pageSize?: number
}

/** 新增插件 DTO */
export interface CreateAdminPluginDto {
  name: string
  description: string
  type: AdminPluginType
  version: string
  entryPoint?: string
  sandboxConfig?: SandboxConfig
  pricingMode: PluginPricingMode
  pricePerCall: number
  pricePerTokenInput: number
  pricePerTokenOutput: number
}

/** 更新插件 DTO */
export interface UpdateAdminPluginDto {
  name?: string
  description?: string
  type?: AdminPluginType
  version?: string
  entryPoint?: string
  sandboxConfig?: SandboxConfig
  pricingMode?: PluginPricingMode
  pricePerCall?: number
  pricePerTokenInput?: number
  pricePerTokenOutput?: number
}

/** 驳回请求体 */
export interface PluginRejectDto {
  reason: string
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

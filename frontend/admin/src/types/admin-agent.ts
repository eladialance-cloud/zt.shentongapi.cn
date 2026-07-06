// 管理端 Agent 市场管理模块类型定义
// 数据合同真源：Task 20 - Agent 市场管理

import type { AdminPaginatedResult } from './admin-auth'

/** Agent 分类(固定 5 个) */
export type AgentCategory =
  | 'office'
  | 'programming'
  | 'copywriting'
  | 'data_analysis'
  | 'other'

/** Agent 状态 */
export type AgentStatus =
  | 'published' // 已发布
  | 'unpublished' // 已下架
  | 'pending_review' // 待审核
  | 'rejected' // 已驳回

/** Agent 审核状态(用于审核队列) */
export type AgentReviewStatus =
  | 'pending_review'
  | 'published'
  | 'rejected'
  | 'unpublished'

/** 定价模式 */
export type AgentPricingMode = 'perCall' | 'perToken'

/** 创作者类型 */
export type AgentCreatorType = 'official' | 'user'

/** Agent 项 */
export interface AdminAgentItem {
  id: number
  name: string
  displayName?: string
  description: string
  /** 系统提示词 */
  systemPrompt?: string
  category: AgentCategory
  /** 使用示例 */
  usageExamples?: string[]
  /** 绑定模型 ID */
  modelId?: string
  /** 模型配置(自由 JSON) */
  modelConfig?: Record<string, unknown>
  /** AES 加密后的 apiKey(可选) */
  apiKey?: string
  creatorType: AgentCreatorType
  creatorName?: string
  status: AgentStatus
  /** 定价模式 */
  pricingMode: AgentPricingMode
  /** 每次调用价格(积分) */
  pricePerCall: number
  /** 输入 token 单价(decimal) */
  pricePerTokenInput: number
  /** 输出 token 单价(decimal) */
  pricePerTokenOutput: number
  /** 调用次数 */
  callCount: number
  /** 评分 */
  rating?: number
  /** 审核驳回原因 */
  rejectReason?: string
  /** 强制下架原因 */
  forceUnpublishReason?: string
  /** 提交审核时间 ISO 8601 */
  submittedAt?: string
  createdAt: string
  updatedAt: string
}

/** Agent 列表查询参数 */
export interface AdminAgentQuery {
  status?: AgentStatus | ''
  category?: AgentCategory | ''
  page?: number
  pageSize?: number
}

/** Agent 审核队列查询参数 */
export interface AdminAgentReviewQuery {
  status?: AgentReviewStatus | ''
  page?: number
  pageSize?: number
}

/** 新增 Agent DTO */
export interface CreateAdminAgentDto {
  name: string
  displayName?: string
  description: string
  systemPrompt?: string
  category: AgentCategory
  usageExamples?: string[]
  modelId?: string
  modelConfig?: Record<string, unknown>
  /** 明文 apiKey(后端 AES 加密存储) */
  apiKey?: string
  pricingMode: AgentPricingMode
  pricePerCall: number
  pricePerTokenInput: number
  pricePerTokenOutput: number
}

/** 更新 Agent DTO */
export interface UpdateAdminAgentDto {
  name?: string
  displayName?: string
  description?: string
  systemPrompt?: string
  category?: AgentCategory
  usageExamples?: string[]
  modelId?: string
  modelConfig?: Record<string, unknown>
  apiKey?: string
  pricingMode?: AgentPricingMode
  pricePerCall?: number
  pricePerTokenInput?: number
  pricePerTokenOutput?: number
}

/** 导入目标状态（与后端 ImportGithubDto.targetStatus 对齐） */
export type ImportTargetStatus = 'published' | 'pending_review' | 'draft'

/** GitHub 异步导入请求 */
export interface ImportGithubDto {
  repoUrl: string
  /** 目标状态，默认 published */
  targetStatus?: ImportTargetStatus
  /** 默认模型 ID，默认 gpt-4o-mini */
  defaultModelId?: string
  /** 默认创建者 ID，默认 1 */
  defaultCreatorId?: number
  /** dry-run 模式：仅解析不入库 */
  dryRun?: boolean
  /** 是否覆盖已存在的导入记录 */
  overwriteExisting?: boolean
}

/** GitHub 异步导入任务状态 */
export type ImportTaskStatus = 'pending' | 'processing' | 'success' | 'failed'

/** 导入统计 */
export interface ImportStats {
  /** 总文件数 */
  total: number
  /** 新增数量 */
  inserted: number
  /** 跳过数量（已存在且未覆盖） */
  skipped: number
  /** 失败数量 */
  failed: number
  /** 耗时毫秒 */
  durationMs: number
  /** 错误列表（最多 50 条，超出截断） */
  errors?: Array<{ filePath: string; error: string }>
}

/** GitHub 异步导入任务 */
export interface ImportGithubTask {
  taskId: string
  status: ImportTaskStatus
  /** 进度 0-100 */
  progress: number
  /** 仓库 URL */
  repoUrl: string
  /** 分支 */
  branch?: string
  /** commit SHA */
  commitSha?: string
  /** 统计信息 */
  stats: ImportStats
  /** 任务级错误信息（如克隆失败） */
  errorMessage?: string
  createdAt: string
  updatedAt?: string
}

/** 驳回/强制下架请求体 */
export interface AgentRejectDto {
  reason: string
}

/** Agent 分类元数据 */
export interface AgentCategoryMeta {
  category: AgentCategory
  /** 显示名(后端存储) */
  displayName: string
  /** 该分类下 Agent 数量 */
  agentCount: number
}

/** 分类显示名更新 DTO */
export interface UpdateCategoryDisplayDto {
  displayName: string
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

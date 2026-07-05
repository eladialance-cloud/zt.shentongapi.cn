// 管理端内容审核模块类型定义
// 数据合同真源：Task 25 - 内容审核

import type { AdminPaginatedResult } from './admin-auth'

/** 敏感词分类 */
export type SensitiveWordCategory =
  | 'politics'
  | 'porn'
  | 'violence'
  | 'ad'
  | 'other'

/** 敏感词处理级别 */
export type SensitiveWordLevel = 'block' | 'replace' | 'review'

/** 敏感词条目 */
export interface SensitiveWord {
  id: number
  /** 敏感词 */
  word: string
  category: SensitiveWordCategory
  level: SensitiveWordLevel
  /** 替换词(level=replace 时使用) */
  replacement?: string
  createdAt: string
  updatedAt: string
}

/** 敏感词查询参数 */
export interface SensitiveWordQuery {
  category?: SensitiveWordCategory
  keyword?: string
  page?: number
  pageSize?: number
}

/** 新增敏感词 DTO */
export interface CreateSensitiveWordDto {
  word: string
  category: SensitiveWordCategory
  level: SensitiveWordLevel
  replacement?: string
}

/** 批量导入敏感词 DTO */
export interface BatchCreateSensitiveWordDto {
  words: Array<{
    word: string
    category: SensitiveWordCategory
    level: SensitiveWordLevel
  }>
}

/** AI 审核配置 */
export interface AuditConfig {
  /** 是否启用 AI 审核 */
  enabled: boolean
  /** 审核模型 ID */
  modelId?: string
  /** 敏感阈值 0-1 */
  sensitiveThreshold: number
  /** 暴力阈值 0-1 */
  violenceThreshold: number
  /** 色情阈值 0-1 */
  pornThreshold: number
  /** 自动处理开关(命中则直接处理,无需人工) */
  autoProcess: boolean
  updatedAt?: string
}

/** 更新 AI 审核配置 DTO */
export interface UpdateAuditConfigDto {
  enabled?: boolean
  modelId?: string
  sensitiveThreshold?: number
  violenceThreshold?: number
  pornThreshold?: number
  autoProcess?: boolean
}

/** 审核队列类型 */
export type AuditQueueType = 'conversation' | 'agent' | 'plugin' | 'workflow'

/** 审核队列项风险级别 */
export type AuditRiskLevel = 'low' | 'medium' | 'high'

/** 审核队列项状态 */
export type AuditQueueStatus = 'pending' | 'approved' | 'rejected' | 'false_positive'

/** 审核队列触发原因 */
export type AuditTriggerReason =
  | 'sensitive_word'
  | 'ai_audit'

/** 审核队列条目 */
export interface AuditQueueItem {
  id: number
  type: AuditQueueType
  /** 内容摘要 */
  contentSummary: string
  /** 完整内容(可选,查看详情时加载) */
  content?: string
  /** 来源用户 ID */
  userId: number
  username?: string
  triggerReason: AuditTriggerReason
  /** 命中的敏感词列表(若 triggerReason=sensitive_word) */
  hitWords?: string[]
  riskLevel: AuditRiskLevel
  status: AuditQueueStatus
  /** ISO 8601 时间 */
  createdAt: string
  /** 处理人 */
  processedBy?: string
  /** 处理时间 */
  processedAt?: string
  /** 处理备注/驳回原因 */
  processRemark?: string
}

/** 审核队列查询参数 */
export interface AuditQueueQuery {
  type?: AuditQueueType
  status?: AuditQueueStatus
  page?: number
  pageSize?: number
}

/** AI 审核测试请求 DTO */
export interface AuditTestDto {
  text: string
}

/** AI 审核测试结果 */
export interface AuditTestResult {
  /** 是否命中风险 */
  flagged: boolean
  /** 综合风险分数 0-1 */
  riskScore: number
  /** 各类别分数 */
  categories: {
    sensitive: number
    violence: number
    porn: number
  }
  /** 命中的敏感词 */
  hitWords: string[]
  /** 建议处理动作 */
  suggestion: 'allow' | 'review' | 'block'
}

/** 驳回审核 DTO */
export interface RejectAuditDto {
  reason: string
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

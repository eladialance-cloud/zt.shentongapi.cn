// 管理端工作流模板管理模块类型定义
// 数据合同真源：Task 21 - 工作流模板管理

import type { AdminPaginatedResult } from './admin-auth'

/** 工作流引擎类型 */
export type WorkflowEngineType = 'n8n' | 'coze'

/** 工作流分类 */
export type AdminWorkflowCategory =
  | 'automation'
  | 'integration'
  | 'data_processing'
  | 'other'

/** 工作流状态 */
export type AdminWorkflowStatus = 'active' | 'inactive'

/** 工作流审核状态 */
export type WorkflowReviewStatus =
  | 'pending_review'
  | 'approved'
  | 'rejected'

/** 工作流模板 */
export interface AdminWorkflowItem {
  id: number
  name: string
  description: string
  engineType: WorkflowEngineType
  /** n8n 工作流 ID(engineType=n8n 时) */
  n8nWorkflowId?: string
  /** Coze 工作流 ID(engineType=coze 时) */
  cozeWorkflowId?: string
  category: AdminWorkflowCategory
  /** 输入 Schema(JSON Schema) */
  inputSchema?: Record<string, unknown>
  /** 输出 Schema(JSON Schema) */
  outputSchema?: Record<string, unknown>
  /** 单次执行价格(积分) */
  pricePerExecution: number
  /** 是否启用 */
  isActive: boolean
  /** 审核状态 */
  reviewStatus?: WorkflowReviewStatus
  /** 驳回原因 */
  rejectReason?: string
  /** 执行次数 */
  executionCount: number
  /** 创作者 */
  creatorName?: string
  createdAt: string
  updatedAt: string
}

/** 工作流查询参数 */
export interface AdminWorkflowQuery {
  engineType?: WorkflowEngineType | ''
  category?: AdminWorkflowCategory | ''
  page?: number
  pageSize?: number
}

/** 工作流审核查询参数 */
export interface AdminWorkflowReviewQuery {
  status?: WorkflowReviewStatus | ''
  page?: number
  pageSize?: number
}

/** 新增工作流 DTO */
export interface CreateAdminWorkflowDto {
  name: string
  description: string
  engineType: WorkflowEngineType
  n8nWorkflowId?: string
  cozeWorkflowId?: string
  category: AdminWorkflowCategory
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  pricePerExecution: number
  isActive: boolean
}

/** 更新工作流 DTO */
export interface UpdateAdminWorkflowDto {
  name?: string
  description?: string
  engineType?: WorkflowEngineType
  n8nWorkflowId?: string
  cozeWorkflowId?: string
  category?: AdminWorkflowCategory
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  pricePerExecution?: number
  isActive?: boolean
}

/** 驳回请求体 */
export interface WorkflowRejectDto {
  reason: string
}

/** 工作流统计 */
export interface AdminWorkflowStats {
  /** 总工作流数 */
  total: number
  /** 活跃数 */
  active: number
  /** 按 engineType 分组统计 */
  byEngineType: Array<{
    engineType: WorkflowEngineType
    total: number
    active: number
    executionCount: number
  }>
  /** Top 10 热门工作流(按执行次数排序) */
  topWorkflows: Array<{
    id: number
    name: string
    engineType: WorkflowEngineType
    executionCount: number
  }>
  /** 近 30 天执行趋势 [{ date, count }] */
  executionTrend: Array<{
    date: string
    count: number
  }>
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

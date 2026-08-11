// 管理端工作流模板管理模块类型定义
// 数据合同真源：Task 21 - 工作流模板管理（合并版）

import type { AdminPaginatedResult } from './admin-auth'

/** 工作流引擎类型 */
export type WorkflowEngineType = 'n8n' | 'coze'

/** 工作流分类 */
export type WorkflowCategory =
  | 'automation'
  | 'integration'
  | 'data_processing'
  | 'ai_collaboration'
  | 'independent'
  | 'other'

/** 工作流发布状态（Tab 筛选用） */
export type WorkflowPublishStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'published'
  | 'rejected'

/** 工作流模板（完整字段） */
export interface AdminWorkflowItem {
  id: number
  name: string
  description?: string
  engineType: WorkflowEngineType
  /** n8n 工作流 ID */
  n8nWorkflowId?: string
  /** Coze 工作流 ID */
  cozeWorkflowId?: string
  category: string
  /** 场景分类 */
  sceneCategory?: string
  /** 来源: github=导入 manual=手工 */
  sourceType?: 'github' | 'manual'
  /** GitHub 导入时仓库 topics 快照 */
  githubTopics?: string[]
  /** n8n JSON 原始定义 */
  workflowJson?: string
  /** 输入参数 Schema */
  inputSchema?: Record<string, unknown>
  /** 输出 Schema */
  outputSchema?: Record<string, unknown>
  /** 单次执行积分 */
  pricePerExecution: number
  /** 是否启用（下架/上架） */
  isActive: boolean
  /** 是否发布 */
  isPublished: boolean
  /** 发布状态 */
  publishStatus?: WorkflowPublishStatus
  /** 审核状态 */
  reviewStatus?: string
  /** 驳回原因 */
  rejectReason?: string
  /** 执行次数 */
  executionCount: number
  /** 节点数 */
  nodeCount?: number
  /** 触发类型 */
  triggerType?: string
  /** GitHub 来源仓库 */
  sourceRepo?: string
  /** GitHub 来源路径 */
  sourcePath?: string
  version?: string
  icon?: string
  tags?: string[]
  creatorName?: string
  createdAt: string
  updatedAt: string
}

/** 工作流查询参数 */
export interface AdminWorkflowQuery {
  engineType?: WorkflowEngineType | ''
  category?: string | ''
  keyword?: string
  status?: string
  publishStatus?: WorkflowPublishStatus | ''
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
  workflowJson?: string
  category?: string
  sceneCategory?: string
  sourceType?: 'github' | 'manual'
  githubTopics?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  pricePerExecution: number
  isActive?: boolean
  icon?: string
  tags?: string[]
  triggerType?: string
  nodeCount?: number
}

/** 更新工作流 DTO */
export interface UpdateAdminWorkflowDto {
  name?: string
  description?: string
  engineType?: WorkflowEngineType
  n8nWorkflowId?: string
  cozeWorkflowId?: string
  workflowJson?: string
  category?: string
  sceneCategory?: string
  sourceType?: 'github' | 'manual'
  githubTopics?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  pricePerExecution?: number
  isActive?: boolean
  isPublished?: boolean
  icon?: string
  tags?: string[]
  publishStatus?: WorkflowPublishStatus
  triggerType?: string
  nodeCount?: number
}

/** GitHub 导入 DTO */
export interface ImportGithubWorkflowDto {
  repoUrl: string
  filePath?: string
  category?: string
}

/** GitHub 导入结果 */
export interface ImportGithubWorkflowResult {
  imported: number
}

/** 驳回请求体 */
export interface WorkflowRejectDto {
  reason: string
}

/** 工作流统计 */
export interface AdminWorkflowStats {
  total: number
  active: number
  pending: number
  approved: number
  published: number
  rejected: number
  byEngineType: Array<{
    engineType: WorkflowEngineType
    total: number
    active: number
    executionCount: number
  }>
  topWorkflows: Array<{
    id: number
    name: string
    engineType: WorkflowEngineType
    executionCount: number
  }>
  executionTrend: Array<{ date: string; count: number }>
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

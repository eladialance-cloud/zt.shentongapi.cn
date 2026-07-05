// 工作流模块类型定义
// 数据合同真源：Task 9 工作流功能模块

/** 工作流分类 */
export type WorkflowCategory =
  | 'automation'
  | 'integration'
  | 'data_processing'
  | 'other'

/** 工作流模板 */
export interface WorkflowTemplate {
  id: number
  name: string
  description: string
  category: WorkflowCategory
  previewImage?: string
  usageCount: number
  /** 输入 Schema（JSON Schema） */
  inputSchema?: unknown
  /** 输出 Schema（JSON Schema） */
  outputSchema?: unknown
  /** 单次执行消耗积分 */
  pricePerExecution?: number
  createdAt?: Date
  updatedAt?: Date
}

/** 工作流执行状态 */
export type WorkflowExecutionStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled'

/** 工作流执行记录 */
export interface WorkflowExecution {
  id: number
  workflowId: number
  status: WorkflowExecutionStatus
  input?: unknown
  output?: unknown
  durationMs?: number
  creditsCost: number
  errorMessage?: string
  createdAt: Date
  finishedAt?: Date
}

/** 工作流模板列表查询参数 */
export interface WorkflowTemplateQuery {
  category?: WorkflowCategory | string
  keyword?: string
  page?: number
  pageSize?: number
}

/** 工作流执行记录列表查询参数 */
export interface WorkflowExecutionQuery {
  workflowId?: number
  status?: WorkflowExecutionStatus | string
  page?: number
  pageSize?: number
}

/** 分页结果（与 chat.ts PaginatedResult 一致，这里独立声明避免循环依赖） */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

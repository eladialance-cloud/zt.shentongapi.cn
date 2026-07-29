// 管理端任务中心模块类型定义
// 数据合同真源：后端 AgentTask 实体 + TaskOutputItem 实体

/** 任务类型 */
export type TaskType = 'chat' | 'codex' | 'workflow' | 'tool'

/** 任务状态 */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** 任务输出项类型 */
export type TaskOutputItemType = 'text' | 'code' | 'file' | 'image' | 'error'

/** 任务实体 */
export interface AdminTask {
  id: number
  /** 关联 Agent ID */
  agentId: number
  /** 用户 ID */
  userId: number
  /** 任务类型 */
  type: TaskType
  /** 任务状态 */
  status: TaskStatus
  /** 输入参数（JSON） */
  input: Record<string, unknown>
  /** 输出结果（JSON） */
  output?: Record<string, unknown>
  /** 错误信息 */
  errorMessage?: string
  /** 开始时间 */
  startedAt?: string
  /** 完成时间 */
  completedAt?: string
  createdAt: string
  updatedAt: string
}

/** 任务输出项 */
export interface TaskOutputItem {
  id: number
  /** 关联任务 ID */
  taskId: number
  /** 输出项类型 */
  itemType: TaskOutputItemType
  /** 文本内容 */
  content: string
  /** 元数据（JSON） */
  metadata?: Record<string, unknown>
  /** 排序序号 */
  sortOrder: number
  createdAt: string
}

/** 任务详情（含输出项列表） */
export interface AdminTaskDetail extends AdminTask {
  /** 输出项列表 */
  outputItems?: TaskOutputItem[]
}

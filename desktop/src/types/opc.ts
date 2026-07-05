// OPC 虚拟团队模块类型定义
// 数据合同真源：Task 14 - OPC 虚拟团队协作

/** 团队成员角色 */
export type MemberRole =
  | 'leader'
  | 'member'
  | 'observer'
  | 'reviewer'

/** 成员状态 */
export type MemberStatus = 'active' | 'busy' | 'idle' | 'offline'

/** 任务状态 */
export type TaskStatus = 'todo' | 'in_progress' | 'done'

/** 任务优先级 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

/** OPC 团队 */
export interface OPCTeam {
  id: number
  name: string
  description: string
  /** 成员数 */
  memberCount: number
  /** 任务数 */
  taskCount: number
  createdAt: string
  updatedAt?: string
}

/** 团队成员 */
export interface TeamMember {
  id: number
  teamId: number
  /** Agent ID（OPC 团队成员为 AI Agent） */
  agentId: number
  agentName: string
  agentAvatar?: string
  role: MemberRole
  status: MemberStatus
  /** 该成员承担的任务数 */
  taskCount: number
  joinedAt: string
}

/** 任务 */
export interface OPCTask {
  id: number
  teamId: number
  title: string
  description?: string
  /** 负责成员 ID */
  assigneeId?: number
  assigneeName?: string
  assigneeAvatar?: string
  status: TaskStatus
  priority: TaskPriority
  /** 截止时间（ISO 8601） */
  dueDate?: string
  /** 任务顺序（看板内排序） */
  order?: number
  createdAt: string
  updatedAt?: string
}

/** 协作流程节点 */
export interface WorkflowNode {
  id: number
  name: string
  description?: string
  /** 节点顺序 */
  order: number
  /** 负责成员 ID 列表 */
  assigneeIds?: number[]
}

/** 创建团队 DTO */
export interface CreateTeamDto {
  name: string
  description?: string
  /** 初始成员 Agent ID 列表 */
  memberAgentIds?: number[]
}

/** 更新任务 DTO */
export interface UpdateTaskDto {
  status?: TaskStatus
  title?: string
  description?: string
  assigneeId?: number
  priority?: TaskPriority
  dueDate?: string
}

/** 可加入团队的 Agent（用于创建团队时选择成员） */
export interface SelectableAgent {
  id: number
  name: string
  avatar?: string
  description?: string
}

/** 任务查询参数 */
export interface TaskQuery {
  status?: TaskStatus
  page?: number
  pageSize?: number
}

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

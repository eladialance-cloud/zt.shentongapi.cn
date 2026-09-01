// 团队模块类型定义 — 替换 OPC 模块
// 设计文档: team_module_design_20260730.md
// 核心变化: 成员绑定 Agent + 自定义职能，不再绑定真实用户

/** 任务状态 */
export type TeamTaskStatus = "pending" | "in_progress" | "completed" | "failed"

/** 任务优先级 */
export type TeamTaskPriority = "low" | "medium" | "high" | "urgent"

/** 团队 */
export interface Team {
  id: number
  name: string
  avatar?: string
  description?: string
  /** 关联的知识库 ID（可选） */
  knowledgeBaseId?: number
  memberCount: number
  creatorId: number
  createdAt: string
  updatedAt?: string
}

/** 团队成员（绑定 Agent + 自定义职能） */
export interface TeamMember {
  id: number
  teamId: number
  /** 关联的 Agent ID */
  agentId: number | string
  /** Agent 名称快照 */
  agentName: string
  /** Agent 头像快照 */
  agentAvatar?: string
  /** 自定义职能名，如 CEO/渠道总监/销售经理 */
  roleTitle: string
  /** 职能描述 */
  roleDescription?: string
  /** 职能图标 emoji */
  roleEmoji?: string
  /** 主题色（用于 Office 工位区分） */
  themeColor?: string
  /** 成员排序（Office 工位顺序） */
  sortOrder: number
  /** 是否激活 */
  isActive: boolean
  addedBy: number
  joinedAt: string
}

/** 执行方式：team=指定团队 auto=Hermes自动匹配 agent=指定单个Agent */
export type TeamTaskExecuteMode = "team" | "auto" | "agent"

/** 团队任务 */
export interface TeamTask {
  id: number
  /** 执行团队 ID（auto/agent 模式为空） */
  teamId?: number | null
  /** 执行方式 */
  executeMode?: TeamTaskExecuteMode
  /** 指定单个 Agent（executeMode=agent 时指向 agents.id） */
  agentId?: number
  title: string
  description?: string
  status: TeamTaskStatus
  priority: TeamTaskPriority
  /** 分配给哪个成员（Agent） */
  assigneeMemberId?: number
  assigneeName?: string
  assigneeAvatar?: string
  creatorId: number
  dueDate?: string
  result?: unknown
  createdAt: string
  completedAt?: string
  /** 关联需求单 ID（二期） */
  briefId?: number
  /** 关联执行记录（tasks.id 或 hermesTaskId，二期） */
  executionRef?: string
}

/** 创建团队-成员 DTO（员工名称/职位/选择 Agent） */
export interface CreateTeamMemberDto {
  agentId: number | string
  /** 员工名称 */
  agentName?: string
  /** 职位（职能名） */
  roleTitle?: string
  roleDescription?: string
  roleEmoji?: string
  themeColor?: string
}

/** 创建团队 DTO */
export interface CreateTeamDto {
  name: string
  description?: string
  /** 关联的知识库 ID（可选） */
  knowledgeBaseId?: number
  /** 初始成员 Agent ID 列表（简化方式） */
  memberAgentIds?: Array<number | string>
  /** 初始成员详情（员工名称/职位/Agent） */
  members?: CreateTeamMemberDto[]
}

/** 添加成员 DTO */
export interface AddMemberDto {
  agentId: number | string
  roleTitle: string
  roleDescription?: string
  roleEmoji?: string
  themeColor?: string
  sortOrder?: number
}

/** 更新成员 DTO */
export interface UpdateMemberDto {
  roleTitle?: string
  roleDescription?: string
  roleEmoji?: string
  themeColor?: string
  sortOrder?: number
  isActive?: boolean
}

/** 更新任务 DTO */
export interface UpdateTeamTaskDto {
  status?: TeamTaskStatus
  title?: string
  description?: string
  assigneeMemberId?: number
  priority?: TeamTaskPriority
  dueDate?: string
  result?: unknown
  /** 迁移到目标团队（执行前换团队；null=改为无团队执行） */
  teamId?: number | null
  /** 切换执行方式 */
  executeMode?: TeamTaskExecuteMode
  /** 指定单个 Agent（executeMode=agent 时） */
  agentId?: number
}

/** 可选 Agent（用于创建团队时选择成员） */
export interface SelectableAgent {
  id: number | string
  name: string
  avatar?: string
  description?: string
}

/** 任务查询参数 */
export interface TeamTaskQuery {
  status?: TeamTaskStatus
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

/** 团队详情（含 workflow 节点） */
export interface TeamWorkflowNode {
  id: number
  name: string
  description?: string
  order: number
  assigneeIds?: number[]
}

/** 团队成员角色（复用 OPC 时代的角色枚举） */
export type MemberRole = 'leader' | 'member' | 'observer' | 'reviewer'


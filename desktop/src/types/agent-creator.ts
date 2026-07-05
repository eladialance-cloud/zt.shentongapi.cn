// Agent 创建模块类型定义
// 数据合同真源：Task 12 - Agent 创建模块（创作者）

/** Agent 状态 */
export type AgentStatus =
  | 'draft'
  | 'pending_review'
  | 'published'
  | 'rejected'

/** Agent 分类 */
export type CreatorAgentCategory =
  | 'office'
  | 'programming'
  | 'copywriting'
  | 'data_analysis'
  | 'other'

/** 定价模式 */
export type PricingMode = 'per_call' | 'per_token'

/** 创作者 Agent 信息 */
export interface CreatorAgent {
  id: number
  name: string
  displayName: string
  description: string
  avatar?: string
  category: CreatorAgentCategory
  systemPrompt: string
  usageExamples: string[]
  modelId: number
  modelName?: string
  pricingMode: PricingMode
  /** 按次调用定价（pricingMode='per_call' 时生效） */
  pricePerCall: number
  /** 按 Token 定价（pricingMode='per_token' 时生效） */
  pricePerTokenInput: number
  pricePerTokenOutput: number
  status: AgentStatus
  /** 审核驳回原因（status='rejected' 时存在） */
  rejectReason?: string
  callCount: number
  rating: number
  ratingCount: number
  createdAt: string
  updatedAt?: string
}

/** 可选模型信息（来自 /models 接口） */
export interface CreatorModelOption {
  id: number
  name: string
  provider?: string
}

/** 创建/编辑 Agent DTO */
export interface CreateAgentDto {
  name: string
  displayName: string
  description?: string
  avatar?: string
  category: CreatorAgentCategory
  systemPrompt: string
  usageExamples: string[]
  modelId: number
  pricingMode: PricingMode
  pricePerCall?: number
  pricePerTokenInput?: number
  pricePerTokenOutput?: number
}

/** 更新 Agent DTO（部分字段） */
export type UpdateAgentDto = Partial<CreateAgentDto>

/** 列表查询参数 */
export interface CreatorListQuery {
  page?: number
  pageSize?: number
  status?: AgentStatus
}

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 收益汇总 */
export interface RevenueSummary {
  totalRevenue: number
  monthRevenue: number
  totalCalls: number
  /** 最近 30 天每日收益（按时间正序） */
  dailyRevenue: Array<{ date: string; revenue: number; calls: number }>
  /** 可提现余额 */
  availableBalance: number
}

/** 提现状态 */
export type WithdrawalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'completed'

/** 提现记录 */
export interface WithdrawalRecord {
  id: number
  amount: number
  status: WithdrawalStatus
  /** 审核备注 */
  remark?: string
  createdAt: string
  processedAt?: string
}

/** 申请提现 DTO */
export interface CreateWithdrawalDto {
  amount: number
}

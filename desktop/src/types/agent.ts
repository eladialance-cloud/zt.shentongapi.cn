// Agent 市场模块类型定义
// 数据合同真源：Task 7 - Agent 市场 + 后端 src/modules/agent

/** 通用分页查询参数 */
export interface PaginationQuery {
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

/** Agent 信息 */
export interface Agent {
  id: number
  name: string
  description: string
  avatar?: string
  category: string
  tags: string[]
  rating: number
  ratingCount: number
  callCount: number
  pricePerCall: number
  pricePerToken: { input: number; output: number }
  creatorType: 'official' | 'user'
  creatorName?: string
  usageExample?: string
  isOfficial: boolean
  isFavorited?: boolean
}

/** Agent 评价 */
export interface AgentReview {
  id: number
  userId: number
  username: string
  avatar?: string
  rating: number
  comment: string
  createdAt: Date
}

/** Agent 调用日志 */
export interface AgentCallLog {
  id: number
  agentId: number
  agentName: string
  userId: number
  creditsCost: number
  tokenUsage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  status: string
  sessionId: string
  createdAt: Date
}

/** 创建评价 DTO */
export interface CreateReviewDto {
  rating: number
  comment: string
}

/** 市场查询参数 */
export interface MarketQuery extends PaginationQuery {
  tab?: 'all' | 'official' | 'community'
  category?: string
  keyword?: string
}

/** Agent 分类 */
export type AgentCategory =
  | 'office'
  | 'programming'
  | 'copywriting'
  | 'data_analysis'
  | 'other'

/** 市场标签 */
export type MarketTab = 'all' | 'official' | 'community'

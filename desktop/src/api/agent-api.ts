// Agent 市场 API
//
// 端点契约：
//   GET    /agents/market                  市场列表（tab/category/keyword/page）
//   GET    /agents/market/:id              市场详情
//   GET    /agents/market/:id/reviews      评价列表
//   POST   /agents/market/:id/reviews      创建评价
//   POST   /agents/market/:id/favorite     收藏
//   DELETE /agents/market/:id/favorite     取消收藏
//   GET    /agents/favorites               我的收藏列表
//   GET    /agents/usage-logs              我的使用记录

import { httpClient } from './http-client'
import type {
  Agent,
  AgentReview,
  AgentCallLog,
  CreateReviewDto,
  MarketQuery,
  PaginationQuery,
  PaginatedResult
} from '@/types/agent'

/**
 * 市场列表
 * GET /agents/market?tab=&category=&keyword=&page=
 */
export async function listMarketAgents(
  query: MarketQuery = {}
): Promise<PaginatedResult<Agent>> {
  return httpClient.get<PaginatedResult<Agent>>('/agents/market', { params: query })
}

/**
 * 市场详情
 * GET /agents/market/:id
 */
export async function getMarketDetail(id: number): Promise<Agent> {
  return httpClient.get<Agent>(`/agents/market/${id}`)
}

/**
 * 评价列表
 * GET /agents/market/:id/reviews
 */
export async function getMarketReviews(id: number): Promise<AgentReview[]> {
  return httpClient.get<AgentReview[]>(`/agents/market/${id}/reviews`)
}

/**
 * 创建评价
 * POST /agents/market/:id/reviews  body: { rating, comment }
 */
export async function createReview(
  id: number,
  dto: CreateReviewDto
): Promise<void> {
  await httpClient.post<void>(`/agents/market/${id}/reviews`, dto)
}

/**
 * 收藏 Agent
 * POST /agents/market/:id/favorite
 */
export async function favoriteAgent(id: number): Promise<void> {
  await httpClient.post<void>(`/agents/market/${id}/favorite`)
}

/**
 * 取消收藏
 * DELETE /agents/market/:id/favorite
 */
export async function unfavoriteAgent(id: number): Promise<void> {
  await httpClient.delete<void>(`/agents/market/${id}/favorite`)
}

/**
 * 我的收藏列表
 * GET /agents/favorites
 */
export async function listMyFavorites(): Promise<Agent[]> {
  return httpClient.get<Agent[]>('/agents/favorites')
}

/**
 * 我的使用记录
 * GET /agents/usage-logs?page=
 */
export async function getUsageLogs(
  query: PaginationQuery = {}
): Promise<PaginatedResult<AgentCallLog>> {
  return httpClient.get<PaginatedResult<AgentCallLog>>('/agents/usage-logs', {
    params: query
  })
}

export default {
  listMarketAgents,
  getMarketDetail,
  getMarketReviews,
  createReview,
  favoriteAgent,
  unfavoriteAgent,
  listMyFavorites,
  getUsageLogs
}

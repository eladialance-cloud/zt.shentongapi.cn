// Agent 创建模块 API
//
// 端点契约：
//   GET    /agents/creator                       我的 Agent 列表（page/status）
//   POST   /agents/creator                       创建 Agent
//   GET    /agents/creator/:id                   Agent 详情
//   PATCH  /agents/creator/:id                   更新 Agent
//   DELETE /agents/creator/:id                   删除 Agent（仅 draft 可删）
//   POST   /agents/creator/:id/submit            提交审核
//   GET    /agents/creator/revenue/summary       收益汇总
//   GET    /agents/creator/withdrawals           提现记录
//   POST   /agents/creator/withdrawal            申请提现 body: { amount }
//   GET    /models                               可用模型列表

import { httpClient } from './http-client'
import type {
  CreatorAgent,
  CreatorListQuery,
  CreateAgentDto,
  UpdateAgentDto,
  CreatorModelOption,
  RevenueSummary,
  WithdrawalRecord,
  CreateWithdrawalDto,
  PaginatedResult
} from '@/types/agent-creator'

/**
 * 我的 Agent 列表
 * GET /agents/creator?page=&status=
 */
export async function listMyAgents(
  query: CreatorListQuery = {}
): Promise<PaginatedResult<CreatorAgent>> {
  return httpClient.get<PaginatedResult<CreatorAgent>>('/agents/creator', {
    params: query
  })
}

/**
 * 创建 Agent
 * POST /agents/creator
 */
export async function createAgent(dto: CreateAgentDto): Promise<CreatorAgent> {
  return httpClient.post<CreatorAgent>('/agents/creator', dto)
}

/**
 * Agent 详情
 * GET /agents/creator/:id
 */
export async function getAgentDetail(id: number): Promise<CreatorAgent> {
  return httpClient.get<CreatorAgent>(`/agents/creator/${id}`)
}

/**
 * 更新 Agent
 * PATCH /agents/creator/:id
 */
export async function updateAgent(
  id: number,
  dto: UpdateAgentDto
): Promise<CreatorAgent> {
  return httpClient.patch<CreatorAgent>(`/agents/creator/${id}`, dto)
}

/**
 * 删除 Agent（仅 draft 可删除）
 * DELETE /agents/creator/:id
 */
export async function deleteAgent(id: number): Promise<void> {
  await httpClient.delete<void>(`/agents/creator/${id}`)
}

/**
 * 提交审核
 * POST /agents/creator/:id/submit
 */
export async function submitForReview(id: number): Promise<CreatorAgent> {
  return httpClient.post<CreatorAgent>(`/agents/creator/${id}/submit`)
}

/**
 * 收益汇总
 * GET /agents/creator/revenue/summary
 */
export async function getRevenueSummary(): Promise<RevenueSummary> {
  return httpClient.get<RevenueSummary>('/agents/creator/revenue/summary')
}

/**
 * 提现记录
 * GET /agents/creator/withdrawals?page=
 */
export async function listWithdrawals(
  page = 1,
  pageSize = 20
): Promise<PaginatedResult<WithdrawalRecord>> {
  return httpClient.get<PaginatedResult<WithdrawalRecord>>(
    '/agents/creator/withdrawals',
    { params: { page, pageSize } }
  )
}

/**
 * 申请提现
 * POST /agents/creator/withdrawal  body: { amount }
 */
export async function requestWithdrawal(
  dto: CreateWithdrawalDto
): Promise<WithdrawalRecord> {
  return httpClient.post<WithdrawalRecord>('/agents/creator/withdrawal', dto)
}

/**
 * 可用模型列表
 * GET /models
 */
export async function listModels(): Promise<CreatorModelOption[]> {
  return httpClient.get<CreatorModelOption[]>('/models')
}

export default {
  listMyAgents,
  createAgent,
  getAgentDetail,
  updateAgent,
  deleteAgent,
  submitForReview,
  getRevenueSummary,
  listWithdrawals,
  requestWithdrawal,
  listModels
}

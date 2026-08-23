// 需求简报 API（二期：云端 briefs，Bearer JWT）
//
// 端点契约:
//   POST   /briefs                    创建简报 body: { title, goal?, targetAudience?, platforms?, style?, deadline?, sourceChatSessionId?, sourceChatSummary? }
//   GET    /briefs                    简报列表（分页 + status 过滤）
//   GET    /briefs/history            最近简报（倒序，limit 过滤）
//   GET    /briefs/:id                简报详情
//   PATCH  /briefs/:id                更新简报
//   POST   /briefs/:id/confirm        确认简报 body: { manualDispatch? }
//   POST   /briefs/:id/cancel         取消简报
import { httpClient } from './http-client'

export type BriefStatus = 'draft' | 'confirmed' | 'executing' | 'completed' | 'cancelled'
export type DispatchStatus = 'none' | 'pending' | 'done' | 'failed'
export type DispatchPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface DispatchTaskItem {
  roleTitle: string
  taskTitle: string
  description?: string
  priority: DispatchPriority
  dueDate?: string
  dependsOn?: string[]
}

export interface BriefItem {
  id: number
  userId: number
  title: string
  goal?: string | null
  targetAudience?: string | null
  platforms?: string[] | null
  style?: string | null
  deadline?: string | null
  status: BriefStatus
  dispatchStatus: DispatchStatus
  dispatchResult?: DispatchTaskItem[] | null
  sourceChatSessionId?: number | null
  sourceChatSummary?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateBriefPayload {
  title: string
  goal?: string
  targetAudience?: string
  platforms?: string[]
  style?: string
  deadline?: string // YYYY-MM-DD，页面已格式化，不做 Date 转换
  sourceChatSessionId?: number | null
  sourceChatSummary?: string | null
}

export interface UpdateBriefPayload {
  title?: string
  goal?: string
  targetAudience?: string
  platforms?: string[]
  style?: string
  deadline?: string
}

export interface BriefListResult {
  list: BriefItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** 简报列表 GET /briefs?status=&page=&pageSize= */
export function listBriefs(
  query: { status?: BriefStatus; page?: number; pageSize?: number } = {},
): Promise<BriefListResult> {
  return httpClient.get<BriefListResult>('/briefs', { params: query })
}

/** 创建简报 POST /briefs */
export function createBrief(payload: CreateBriefPayload): Promise<BriefItem> {
  return httpClient.post<BriefItem>('/briefs', payload)
}

/** 简报详情 GET /briefs/:id */
export function getBrief(id: number): Promise<BriefItem> {
  return httpClient.get<BriefItem>('/briefs/' + id)
}

/** 更新简报 PATCH /briefs/:id */
export function updateBrief(id: number, payload: UpdateBriefPayload): Promise<BriefItem> {
  return httpClient.patch<BriefItem>('/briefs/' + id, payload)
}

/** 确认简报 POST /briefs/:id/confirm */
export function confirmBrief(
  id: number,
  body: { manualDispatch?: boolean; teamId?: number; executeMode?: 'team' | 'auto' | 'agent'; agentId?: number } = {},
): Promise<BriefItem> {
  return httpClient.post<BriefItem>('/briefs/' + id + '/confirm', body)
}

/** 取消简报 POST /briefs/:id/cancel */
export function cancelBrief(id: number): Promise<BriefItem> {
  return httpClient.post<BriefItem>('/briefs/' + id + '/cancel')
}

/** 最近简报（倒序） GET /briefs/history?limit= */
export function getBriefHistory(query: { limit?: number } = {}): Promise<BriefItem[]> {
  return httpClient.get<BriefItem[]>('/briefs/history', { params: query })
}

export default { listBriefs, createBrief, getBrief, updateBrief, confirmBrief, cancelBrief, getBriefHistory }

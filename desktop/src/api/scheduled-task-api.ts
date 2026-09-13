// 定时任务 API — 对话创建，桌面端软件开着时调度执行
//
// 端点契约:
//   POST   /scheduled-tasks                    创建 body: { title, description?, teamId?, repeatType, runTime?, weekday?, dueAt? }
//   GET    /scheduled-tasks                    列表
//   GET    /scheduled-tasks/:id                详情
//   PATCH  /scheduled-tasks/:id                更新
//   DELETE /scheduled-tasks/:id                删除
//   POST   /scheduled-tasks/:id/fire           触发占位（10 分钟窗口防重复）
//   POST   /scheduled-tasks/:id/fired          完成回执 body: { success?, error? }
import { httpClient } from './http-client'

export type ScheduledRepeatType = 'once' | 'daily' | 'weekly'
export type ScheduledTaskStatus = 'active' | 'paused' | 'done' | 'failed'

/**
 * 定时任务执行方式：
 * - llm：交给深瞳机器人（Hermes）逐步编排（默认，灵活但慢/贵）
 * - flow：直跑业务流引擎（确定、快、可控；对标 RRClaw 的 command 型定时任务）
 */
export type ScheduledExecuteKind = 'llm' | 'flow'

export interface ScheduledTask {
  id: number
  userId: number
  title: string
  description?: string | null
  teamId?: number | null
  /** 归属官署/角色 id（如 ceo；缺省不限；官署详情页据此展示） */
  agentId?: string | null
  repeatType: ScheduledRepeatType
  runTime?: string | null
  weekday?: number | null
  dueAt?: string | null
  nextRunAt?: string | null
  status: ScheduledTaskStatus
  firingToken?: string | null
  lastRunAt?: string | null
  lastError?: string | null
  /** 执行方式（缺省 llm，兼容历史任务） */
  executeKind?: ScheduledExecuteKind | null
  /** 业务流 id（executeKind=flow 时必填） */
  flowId?: string | null
  /** 业务流参数（JSON 对象字符串） */
  flowParams?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateScheduledTaskDto {
  title: string
  description?: string
  teamId?: number
  agentId?: string
  repeatType: ScheduledRepeatType
  runTime?: string
  weekday?: number
  dueAt?: string
  executeKind?: ScheduledExecuteKind
  flowId?: string
  flowParams?: string
}

export interface UpdateScheduledTaskDto {
  title?: string
  description?: string
  teamId?: number
  agentId?: string
  repeatType?: ScheduledRepeatType
  runTime?: string
  weekday?: number
  dueAt?: string
  status?: 'active' | 'paused'
  executeKind?: ScheduledExecuteKind
  flowId?: string
  flowParams?: string
}

/** 创建定时任务 */
export function createScheduledTask(dto: CreateScheduledTaskDto): Promise<ScheduledTask> {
  return httpClient.post<ScheduledTask>('/scheduled-tasks', dto)
}

/** 定时任务列表（可按官署过滤） */
export async function listScheduledTasks(agentId?: string): Promise<ScheduledTask[]> {
  const all = await httpClient.get<ScheduledTask[]>('/scheduled-tasks')
  if (!agentId) return all
  return (all || []).filter((t) => (t.agentId ?? null) === agentId)
}

/** 更新定时任务 */
export function updateScheduledTask(id: number, dto: UpdateScheduledTaskDto): Promise<ScheduledTask> {
  return httpClient.patch<ScheduledTask>(`/scheduled-tasks/${id}`, dto)
}

/** 删除定时任务 */
export async function deleteScheduledTask(id: number): Promise<void> {
  await httpClient.delete<void>(`/scheduled-tasks/${id}`)
}

/** 触发占位（调度器专用；到期才返回，否则抛错） */
export function fireScheduledTask(id: number): Promise<ScheduledTask> {
  return httpClient.post<ScheduledTask>(`/scheduled-tasks/${id}/fire`, {})
}

/** 完成回执 */
export function firedScheduledTask(
  id: number,
  body: { success?: boolean; error?: string } = {},
): Promise<ScheduledTask> {
  return httpClient.post<ScheduledTask>(`/scheduled-tasks/${id}/fired`, body)
}

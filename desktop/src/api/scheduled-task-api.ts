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

export interface ScheduledTask {
  id: number
  userId: number
  title: string
  description?: string | null
  teamId?: number | null
  repeatType: ScheduledRepeatType
  runTime?: string | null
  weekday?: number | null
  dueAt?: string | null
  nextRunAt?: string | null
  status: ScheduledTaskStatus
  firingToken?: string | null
  lastRunAt?: string | null
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateScheduledTaskDto {
  title: string
  description?: string
  teamId?: number
  repeatType: ScheduledRepeatType
  runTime?: string
  weekday?: number
  dueAt?: string
}

export interface UpdateScheduledTaskDto {
  title?: string
  description?: string
  teamId?: number
  repeatType?: ScheduledRepeatType
  runTime?: string
  weekday?: number
  dueAt?: string
  status?: 'active' | 'paused'
}

/** 创建定时任务 */
export function createScheduledTask(dto: CreateScheduledTaskDto): Promise<ScheduledTask> {
  return httpClient.post<ScheduledTask>('/scheduled-tasks', dto)
}

/** 定时任务列表 */
export function listScheduledTasks(): Promise<ScheduledTask[]> {
  return httpClient.get<ScheduledTask[]>('/scheduled-tasks')
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

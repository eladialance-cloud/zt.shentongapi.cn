
import { httpClient } from './http-client'

export interface TaskItem {
  id: number
  taskType: string
  agentId: string | null
  title: string | null
  status: string
  inputText: string | null
  inputParams: Record<string, unknown> | null
  errorMessage: string | null
  durationMs: number | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface TaskOutputItem {
  id: number
  taskId: number
  outputType: string
  content: string | null
  contentJson: Record<string, unknown> | null
  fileUrl: string | null
  fileSize: number | null
  mimeType: string | null
  metadata: Record<string, unknown> | null
  sortOrder: number
  createdAt: string
}

export interface TaskDetail {
  task: TaskItem
  outputItems: TaskOutputItem[]
}

export interface TaskListResponse {
  list: TaskItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export async function getTaskList(params: {
  page?: number
  pageSize?: number
  taskType?: string
  status?: string
  keyword?: string
}): Promise<TaskListResponse> {
  return httpClient.get<TaskListResponse>('/tasks', { params })
}

export async function getTaskDetail(id: number): Promise<TaskDetail> {
  return httpClient.get<TaskDetail>(`/tasks/${id}`)
}

/** 取消任务 */
export async function cancelTask(id: number): Promise<TaskItem> {
  return httpClient.post<TaskItem>(`/tasks/${id}/cancel`)
}

/** 重新运行任务（用原始输入再跑一次） */
export async function rerunTask(id: number): Promise<TaskItem> {
  return httpClient.post<TaskItem>(`/tasks/${id}/rerun`)
}

/** 重试失败任务 */
export async function retryTask(id: number): Promise<TaskItem> {
  return httpClient.post<TaskItem>(`/tasks/${id}/retry`)
}

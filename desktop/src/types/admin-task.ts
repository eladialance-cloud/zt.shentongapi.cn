import type { AdminPaginatedResult } from './admin-auth'

export type TaskType = 'chat' | 'workflow' | 'skill' | 'multi_agent' | 'codex'

/** 任务状态 */
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'

export type OutputType = 'text' | 'form' | 'image' | 'audio' | 'video'

export interface TaskItem {
  id: number
  userId: number
  agentId?: number
  taskType: TaskType
  title?: string
  inputText?: string
  inputParams?: Record<string, unknown>
  status: TaskStatus
  hermesTaskId?: string
  errorMessage?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  creditsCost: number
  creditsFrozen: number
  createdAt: string
  updatedAt: string
}

export interface TaskOutputItem {
  id: number
  taskId: number
  outputType: OutputType
  content?: string
  contentJson?: Record<string, unknown>
  fileUrl?: string
  fileSize?: number
  mimeType?: string
  sortOrder: number
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface TaskQueryDto {
  taskType?: TaskType | ''
  status?: TaskStatus | ''
  page?: number
  pageSize?: number
}

/** DTO */
export interface CreateTaskDto {
  taskType: TaskType
  agentId?: number
  title?: string
  inputText?: string
  inputParams?: Record<string, unknown>
}

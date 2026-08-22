// 用户端任务 API
//
// 端点契约:
//   GET    /tasks                   我的任务列表（分页 + status/taskType 过滤）
//   POST   /tasks                   创建任务 body: { taskType, title?, inputText?, inputParams? }
//   POST   /tasks/:id/cancel        取消任务
//   GET    /tasks/:id/outputs       任务输出项
import { httpClient } from './http-client'

export type TaskType = 'chat' | 'workflow' | 'skill' | 'multi_agent' | 'codex'
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'

export interface TaskItem {
  id: number
  userId: number
  agentId?: number | null
  taskType: TaskType
  title?: string | null
  inputText?: string | null
  status: TaskStatus
  hermesTaskId?: string | null
  errorMessage?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  durationMs?: number | null
  creditsCost: number
  createdAt: string
  updatedAt: string
}

export interface TaskListResult<T = TaskItem> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateTaskPayload {
  taskType: TaskType
  title?: string
  inputText?: string
  inputParams?: Record<string, unknown>
}

/** 任务列表 GET /tasks */
export function listTasks(
  query: { page?: number; pageSize?: number; status?: TaskStatus } = {},
): Promise<TaskListResult<TaskItem>> {
  return httpClient.get<TaskListResult>('/tasks', { params: query })
}

/** 创建任务 POST /tasks */
export function createTask(payload: CreateTaskPayload): Promise<TaskItem> {
  return httpClient.post<TaskItem>('/tasks', payload)
}

/** 取消任务 POST /tasks/:id/cancel */
export function cancelTask(id: number): Promise<unknown> {
  return httpClient.post<unknown>('/tasks/' + id + '/cancel')
}


/** N8N 工作流（定时任务来源） */
export interface N8nWorkflowItem {
  id: number
  workflowId: string
  name: string
  active: boolean
  lastExecutedAt?: string | null
  lastExecutionStatus?: string
  createdAt: string
}

/** 我的 N8N 工作流 GET /n8n/workflows */
export function listN8nWorkflows(
  query: { page?: number; pageSize?: number } = {},
): Promise<TaskListResult<N8nWorkflowItem>> {
  return httpClient.get<TaskListResult<N8nWorkflowItem>>('/n8n/workflows', {
    params: query,
  })
}
/** 统一任务源：team=团队 task=我的任务 hermes=Hermes 调用日志 */
export type UnifiedTaskSource = 'team' | 'task' | 'hermes'

/** 统一任务状态：todo=待执行 running=执行中 done=成功 failed=失败 cancelled=已取消 */
export type UnifiedTaskStatus = 'todo' | 'running' | 'done' | 'failed' | 'cancelled'

/** 统一任务项 GET /tasks/unified */
export interface UnifiedTaskItem {
  source: UnifiedTaskSource
  sourceId: number
  title: string
  status: UnifiedTaskStatus
  rawStatus: string
  assignee?: string
  createdAt: string
  finishedAt?: string | null
  briefId?: number | null
  executionRef?: string | null
}

/** 统一任务列表 GET /tasks/unified?status=&source=&page=&pageSize= */
export function getUnifiedTasks(
  query: { status?: UnifiedTaskStatus; source?: UnifiedTaskSource; page?: number; pageSize?: number } = {},
): Promise<TaskListResult<UnifiedTaskItem>> {
  return httpClient.get<TaskListResult<UnifiedTaskItem>>('/tasks/unified', { params: query })
}

export default { listTasks, createTask, cancelTask, listN8nWorkflows, getUnifiedTasks }


import type { AdminPaginatedResult } from './admin-auth'

export type WorkflowLibCategory = 'ai_collaboration' | 'independent' | 'automation'

/** 发布状态 */
export type WorkflowPublishStatus = 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected'

export type WorkflowBindType = 'input' | 'output' | 'trigger'

export interface WorkflowLibItem {
  id: number
  name: string
  description?: string
  category?: WorkflowLibCategory
  workflowJson?: string
  sourceRepo?: string
  sourcePath?: string
  version?: string
  isPublished: boolean
  publishStatus: WorkflowPublishStatus
  icon?: string
  tags?: string[]
  inputSchema?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface WorkflowExecLog {
  id: number
  userId: number
  workflowLibId?: number
  n8nInstanceId?: number
  n8nExecutionId?: string
  taskId?: number
  status: 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
  inputData?: Record<string, unknown>
  outputData?: Record<string, unknown>
  errorMessage?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  createdAt: string
}

/** MCP 绑定 */
export interface WorkflowMcpBind {
  id: number
  workflowLibId: number
  mcpResourceId: number
  bindType: WorkflowBindType
  config?: Record<string, unknown>
  createdAt: string
}

export interface WorkflowLibQuery {
  keyword?: string
  category?: WorkflowLibCategory | ''
  publishStatus?: WorkflowPublishStatus | ''
  page?: number
  pageSize?: number
}

/** DTO */
export interface CreateWorkflowLibDto {
  name: string
  description?: string
  category?: WorkflowLibCategory
  workflowJson?: string
  sourceRepo?: string
  sourcePath?: string
  version?: string
  icon?: string
  tags?: string[]
  inputSchema?: Record<string, unknown>
}

export interface UpdateWorkflowLibDto extends Partial<CreateWorkflowLibDto> {
  publishStatus?: WorkflowPublishStatus
  isPublished?: boolean
}

export interface ImportGithubWorkflowDto {
  repoUrl: string
  filePath?: string
  category?: WorkflowLibCategory
}

export type WorkflowLibPaginatedResult = AdminPaginatedResult<WorkflowLibItem>
export type WorkflowExecLogPaginatedResult = AdminPaginatedResult<WorkflowExecLog>

// 工作流模块 API
//
// 端点契约：
//   GET    /workflow/templates               工作流模板列表（支持 category / keyword）
//   GET    /workflow/templates/:id           工作流模板详情
//   POST   /workflow/:id/execute             执行工作流（body: { input }）
//   GET    /workflow/executions              执行历史列表（支持 workflowId）

import { httpClient } from './http-client'
import type {
  WorkflowTemplate,
  WorkflowExecution,
  WorkflowTemplateQuery,
  WorkflowExecutionQuery,
  PaginatedResult
} from '@/types/workflow'

/**
 * 工作流模板列表
 * GET /workflow/templates?category=&keyword=
 */
export async function listTemplates(
  query: WorkflowTemplateQuery = {}
): Promise<PaginatedResult<WorkflowTemplate>> {
  return httpClient.get<PaginatedResult<WorkflowTemplate>>('/workflow/templates', {
    params: query
  })
}

/**
 * 工作流模板详情
 * GET /workflow/templates/:id
 */
export async function getTemplate(id: number): Promise<WorkflowTemplate> {
  return httpClient.get<WorkflowTemplate>(`/workflow/templates/${id}`)
}

/**
 * 执行工作流
 * POST /workflow/:id/execute
 *
 * 后端在执行前会扣减 pricePerExecution 积分。
 *
 * @param id 工作流模板 ID
 * @param input 执行输入参数
 */
export async function executeWorkflow(
  id: number,
  input: unknown
): Promise<WorkflowExecution> {
  return httpClient.post<WorkflowExecution>(`/workflow/${id}/execute`, { input })
}

/**
 * 工作流执行历史
 * GET /workflow/executions?workflowId=
 */
export async function listExecutions(
  query: WorkflowExecutionQuery = {}
): Promise<PaginatedResult<WorkflowExecution>> {
  return httpClient.get<PaginatedResult<WorkflowExecution>>('/workflow/executions', {
    params: query
  })
}

export default {
  listTemplates,
  getTemplate,
  executeWorkflow,
  listExecutions
}

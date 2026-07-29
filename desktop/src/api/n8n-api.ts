//
// POST /n8n/instances 创建实例
// PUT /n8n/instances/:id 更新实例
// DELETE /n8n/instances/:id 删实例
// POST /n8n/instances/:id/workflows/:wfId/activate 激活工作流
// POST /n8n/instances/:id/workflows/:wfId/deactivate 停用工作流

import { httpClient } from './http-client'
import type { OwnershipFields, OwnerType } from '@/types/resource'

/** 健康检查结果（N8N 基座） */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded'
  version?: string
  latencyMs?: number
  message?: string
}

export interface N8nInstance {
 id: number
 name: string
 description?: string
 baseUrl: string
 status: string
 webhookUrl?: string
 config?: Record<string, unknown>
 lastStartedAt?: string
 createdAt: string
 updatedAt: string
}

/**
 * N8N 工作流（自动化资源）
 *
 * Task 13: 通过 intersection 扩展 OwnershipFields（ownerType / ownerId / version）。
 * TODO(backend): 后端 n8n_workflow 表需新增 owner_type / owner_id / version 列，
 *                并在 /n8n/instances/:id/workflows 接口支持 ?ownerType=official|team|user。
 */
export interface N8nWorkflow extends OwnershipFields {
 id: number
 instanceId: number
 workflowId: string
 name: string
 active: boolean
 lastExecutionStatus: string
 lastExecutedAt?: string
 tags?: string[]
 createdAt: string
 updatedAt: string
}

export const n8nApi = {
 /**
  * 健康检查
  * GET /n8n/health
  */
 getHealth: () =>
   httpClient.get<HealthCheckResult>('/n8n/health'),

 listInstances: () =>
 httpClient.get<N8nInstance[]>('/n8n/instances'),

 getInstance: (id: number) =>
 httpClient.get<N8nInstance>(`/n8n/instances/${id}`),

 createInstance: (data: Partial<N8nInstance> & { apiKey?: string }) =>
 httpClient.post<N8nInstance>('/n8n/instances', data),

 updateInstance: (id: number, data: Partial<N8nInstance> & { apiKey?: string }) =>
 httpClient.put<N8nInstance>(`/n8n/instances/${id}`, data),

 deleteInstance: (id: number) =>
 httpClient.delete<void>(`/n8n/instances/${id}`),

 testConnection: (id: number) =>
 httpClient.post<{ success: boolean; message: string; workflows?: number }>(
 `/n8n/instances/${id}/test`,
 ),

 /**
  * Task 13: 三级资源归属过滤。
  * TODO(backend): 后端需支持 ?ownerType=official|team|user；未支持前会忽略未知参数。
  */
 listWorkflows: (instanceId: number, query: { ownerType?: OwnerType } = {}) =>
   httpClient.get<N8nWorkflow[]>(`/n8n/instances/${instanceId}/workflows`, {
     params: query,
   }),

 /**
  * 工作流详情
  * GET /n8n/instances/:instanceId/workflows/:workflowId
  */
 getWorkflow: (instanceId: number, workflowId: string) =>
   httpClient.get<N8nWorkflow>(
     `/n8n/instances/${instanceId}/workflows/${workflowId}`,
   ),

 triggerWorkflow: (instanceId: number, workflowId: string, inputData?: Record<string, unknown>) =>
 httpClient.post<{ executionId: string; message: string }>(
 `/n8n/instances/${instanceId}/workflows/${workflowId}/trigger`,
 { inputData },
 ),

 activateWorkflow: (instanceId: number, workflowId: string) =>
 httpClient.post<{ success: boolean; message: string }>(
 `/n8n/instances/${instanceId}/workflows/${workflowId}/activate`,
 ),

 deactivateWorkflow: (instanceId: number, workflowId: string) =>
 httpClient.post<{ success: boolean; message: string }>(
 `/n8n/instances/${instanceId}/workflows/${workflowId}/deactivate`,
 ),

 getExecutionStatus: (instanceId: number, executionId: string) =>
 httpClient.get<Record<string, unknown>>(
 `/n8n/instances/${instanceId}/executions/${executionId}`,
 ),
}

export default n8nApi

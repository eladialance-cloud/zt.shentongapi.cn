// 管理端工作流模板库 API
//
// 端点契约：
//   GET    /admin/workflow-lib                   工作流库列表
//   GET    /admin/workflow-lib/:id                  模板详情
//   PATCH  /admin/workflow-lib/:id                  更新模板
//   DELETE /admin/workflow-lib/:id                  删除模板
//   POST   /admin/workflow-lib/import-github        从GitHub导入（支持单文件或批量）
//   GET    /admin/workflow-lib/:id/exec-logs        执行日志
//   GET    /admin/workflow-lib/:id/mcp-binds        MCP绑定列表
//   POST   /admin/workflow-lib/:id/mcp-binds        创建MCP绑定
//   DELETE /admin/workflow-lib/mcp-binds/:bindId    删除MCP绑定

import { adminRequest } from './admin-auth-api'
import type {
  CreateMcpBindDto,
  ImportGithubWorkflowDto,
  ImportGithubWorkflowResult,
  N8nWorkflowLib,
  UpdateWorkflowLibDto,
  WorkflowExecLog,
  WorkflowMcpBind
} from '@/types/admin-workflow-lib'
import type { AdminPaginatedResult } from '@/types/admin-auth'

/** 工作流库列表 */
export async function listWorkflowLib(
  query: Record<string, unknown> = {}
): Promise<AdminPaginatedResult<N8nWorkflowLib>> {
  return adminRequest<AdminPaginatedResult<N8nWorkflowLib>>(
    'get',
    '/admin/workflow-lib',
    { params: query }
  )
}

/** 模板详情 */
export async function getWorkflowLibDetail(
  id: number
): Promise<N8nWorkflowLib> {
  return adminRequest<N8nWorkflowLib>('get', `/admin/workflow-lib/${id}`)
}

/** 更新模板 */
export async function updateWorkflowLib(
  id: number,
  dto: UpdateWorkflowLibDto
): Promise<void> {
  await adminRequest<void>('patch', `/admin/workflow-lib/${id}`, { data: dto })
}

/** 删除模板 */
export async function deleteWorkflowLib(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/workflow-lib/${id}`)
}

/** 从 GitHub 导入（支持单文件或批量） */
export async function importGithubWorkflow(
  dto: ImportGithubWorkflowDto
): Promise<ImportGithubWorkflowResult> {
  return adminRequest<ImportGithubWorkflowResult>(
    'post',
    '/admin/workflow-lib/import-github',
    { data: dto }
  )
}

/** 执行日志 */
export async function getWorkflowExecLogs(
  id: number
): Promise<WorkflowExecLog[]> {
  return adminRequest<WorkflowExecLog[]>(
    'get',
    `/admin/workflow-lib/${id}/exec-logs`
  )
}

/** MCP 绑定列表 */
export async function getWorkflowMcpBinds(
  id: number
): Promise<WorkflowMcpBind[]> {
  return adminRequest<WorkflowMcpBind[]>(
    'get',
    `/admin/workflow-lib/${id}/mcp-binds`
  )
}

/** 创建 MCP 绑定 */
export async function createWorkflowMcpBind(
  id: number,
  dto: CreateMcpBindDto
): Promise<WorkflowMcpBind> {
  return adminRequest<WorkflowMcpBind>(
    'post',
    `/admin/workflow-lib/${id}/mcp-binds`,
    { data: dto }
  )
}

/** 删除 MCP 绑定 */
export async function deleteWorkflowMcpBind(bindId: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/workflow-lib/mcp-binds/${bindId}`)
}

export default {
  listWorkflowLib,
  getWorkflowLibDetail,
  updateWorkflowLib,
  deleteWorkflowLib,
  importGithubWorkflow,
  getWorkflowExecLogs,
  getWorkflowMcpBinds,
  createWorkflowMcpBind,
  deleteWorkflowMcpBind
}

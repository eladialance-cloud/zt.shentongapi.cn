// OPC 虚拟团队 API
//
// 端点契约：
//   GET    /opc/teams                     团队列表
//   POST   /opc/teams                     创建团队 body: { name, description, memberAgentIds }
//   DELETE /opc/teams/:id                 删除团队
//   GET    /opc/teams/:id                 团队详情
//   GET    /opc/teams/:id/members         成员列表
//   GET    /opc/teams/:id/tasks?status=   任务列表
//   PATCH  /opc/tasks/:id                 更新任务 body: { status, ... }
//   GET    /opc/agents                    可加入团队的 Agent 列表（用于选择成员）

import { httpClient } from './http-client'
import type {
  OPCTeam,
  TeamMember,
  OPCTask,
  WorkflowNode,
  CreateTeamDto,
  UpdateTaskDto,
  SelectableAgent,
  TaskQuery,
  PaginatedResult
} from '@/types/opc'

/**
 * 团队列表
 * GET /opc/teams
 */
export async function listTeams(): Promise<OPCTeam[]> {
  return httpClient.get<OPCTeam[]>('/opc/teams')
}

/**
 * 创建团队
 * POST /opc/teams
 */
export async function createTeam(dto: CreateTeamDto): Promise<OPCTeam> {
  return httpClient.post<OPCTeam>('/opc/teams', dto)
}

/**
 * 删除团队
 * DELETE /opc/teams/:id
 */
export async function deleteTeam(id: number): Promise<void> {
  await httpClient.delete<void>(`/opc/teams/${id}`)
}

/**
 * 团队详情
 * GET /opc/teams/:id
 */
export async function getTeamDetail(
  id: number
): Promise<{
  team: OPCTeam
  workflow?: WorkflowNode[]
}> {
  return httpClient.get(`/opc/teams/${id}`)
}

/**
 * 成员列表
 * GET /opc/teams/:id/members
 */
export async function listMembers(id: number): Promise<TeamMember[]> {
  return httpClient.get<TeamMember[]>(`/opc/teams/${id}/members`)
}

/**
 * 任务列表
 * GET /opc/teams/:id/tasks?status=
 */
export async function listTasks(
  id: number,
  query: TaskQuery = {}
): Promise<PaginatedResult<OPCTask>> {
  return httpClient.get<PaginatedResult<OPCTask>>(`/opc/teams/${id}/tasks`, {
    params: query
  })
}

/**
 * 更新任务
 * PATCH /opc/tasks/:id  body: { status, ... }
 */
export async function updateTask(
  taskId: number,
  dto: UpdateTaskDto
): Promise<OPCTask> {
  return httpClient.patch<OPCTask>(`/opc/tasks/${taskId}`, dto)
}

/**
 * 可加入团队的 Agent 列表
 * GET /opc/agents
 */
export async function listSelectableAgents(): Promise<SelectableAgent[]> {
  return httpClient.get<SelectableAgent[]>('/opc/agents')
}

export default {
  listTeams,
  createTeam,
  deleteTeam,
  getTeamDetail,
  listMembers,
  listTasks,
  updateTask,
  listSelectableAgents
}

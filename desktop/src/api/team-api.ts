// 团队 API — 替换 OPC API
//
// 端点契约:
//   GET    /teams                    团队列表
//   POST   /teams                    创建团队 body: { name, description, memberAgentIds }
//   DELETE /teams/:id                删除团队
//   GET    /teams/:id                团队详情
//   GET    /teams/:id/members        成员列表
//   POST   /teams/:id/members        添加成员 body: AddMemberDto
//   PATCH  /teams/:id/members/:mid   更新成员 body: UpdateMemberDto
//   DELETE /teams/:id/members/:mid   移除成员
//   GET    /teams/:id/tasks          任务列表
//   PATCH  /teams/:teamId/tasks/:taskId 更新任务
//   GET    /agents                   可选 Agent 列表（用于选择成员）
import { httpClient } from "./http-client";
import type {
  Team,
  TeamMember,
  TeamTask,
  TeamWorkflowNode,
  CreateTeamDto,
  AddMemberDto,
  UpdateMemberDto,
  UpdateTeamTaskDto,
  SelectableAgent,
  TeamTaskQuery,
  PaginatedResult,
} from "@/types/team";

/** 团队列表 GET /teams（兼容旧版分页对象 {list,...} 与新版数组两种返回） */
export async function listTeams(): Promise<Team[]> {
  const res = await httpClient.get<Team[] | PaginatedResult<Team>>("/teams");
  return Array.isArray(res) ? res : (res?.list ?? []);
}

/** 创建团队 POST /teams */
export async function createTeam(dto: CreateTeamDto): Promise<Team> {
  return httpClient.post<Team>("/teams", dto);
}

/** 删除团队 DELETE /teams/:id */
export async function deleteTeam(id: number): Promise<void> {
  await httpClient.delete<void>(`/teams/${id}`);
}

/** 团队详情 GET /teams/:id */
export async function getTeamDetail(
  id: number,
): Promise<{ team: Team; workflow?: TeamWorkflowNode[] }> {
  return httpClient.get(`/teams/${id}`);
}

/** 成员列表 GET /teams/:id/members */
export async function listMembers(id: number): Promise<TeamMember[]> {
  return httpClient.get<TeamMember[]>(`/teams/${id}/members`);
}

/** 添加成员 POST /teams/:id/members */
export async function addMember(
  teamId: number,
  dto: AddMemberDto,
): Promise<TeamMember> {
  return httpClient.post<TeamMember>(`/teams/${teamId}/members`, dto);
}

/** 更新成员 PATCH /teams/:id/members/:mid */
export async function updateMember(
  teamId: number,
  memberId: number,
  dto: UpdateMemberDto,
): Promise<TeamMember> {
  return httpClient.patch<TeamMember>(
    `/teams/${teamId}/members/${memberId}`,
    dto,
  );
}

/** 移除成员 DELETE /teams/:id/members/:mid */
export async function removeMember(
  teamId: number,
  memberId: number,
): Promise<void> {
  await httpClient.delete<void>(`/teams/${teamId}/members/${memberId}`);
}

/** 任务列表 GET /teams/:id/tasks */
export async function listTasks(
  id: number,
  query: TeamTaskQuery = {},
): Promise<PaginatedResult<TeamTask>> {
  return httpClient.get<PaginatedResult<TeamTask>>(
    `/teams/${id}/tasks`,
    { params: query },
  );
}

/** 更新任务 PATCH /teams/:teamId/tasks/:taskId */
export async function updateTask(
  teamId: number,
  taskId: number,
  dto: UpdateTeamTaskDto,
): Promise<TeamTask> {
  return httpClient.patch<TeamTask>(
    `/teams/${teamId}/tasks/${taskId}`,
    dto,
  );
}

/** 可选 Agent 列表 GET /teams/agents */
export async function listSelectableAgents(): Promise<SelectableAgent[]> {
  return httpClient.get<SelectableAgent[]>("/teams/agents");
}

export default {
  listTeams,
  createTeam,
  deleteTeam,
  getTeamDetail,
  listMembers,
  addMember,
  updateMember,
  removeMember,
  listTasks,
  updateTask,
  listSelectableAgents,
};

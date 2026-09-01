/**
 * OfficeBridge — Chat页面 ↔ 办公室可视化 事件桥接 (v2.1 真实数据模块)
 * 
 * 旧2.5D系统通过此桥接触发办公室角色动画（保留 no-op 兼容方法）。
 * 成员/任务数据接 team-api：GET /teams → GET /teams/:id/members /tasks，PATCH 任务状态流转。
 */

import { listTeams, listMembers, listTasks, updateTask } from '@/api/team-api'
import type { TeamMember, TeamTask, TeamTaskStatus } from '@/types/team'

export function isRetrieveTool(toolName: string): boolean {
  // 判断是否为检索类工具调用
  const retrievePatterns = ['search', 'retrieve', 'query', 'find', 'lookup', 'rag', 'knowledge']
  return retrievePatterns.some(p => toolName.toLowerCase().includes(p))
}

/** 取当前首个团队 ID（无团队返回 null） */
export async function getActiveTeamId(): Promise<number | null> {
  const teams = await listTeams()
  return teams[0]?.id ?? null
}

/** 读取当前团队真实成员（GET /teams/:id/members） */
export async function fetchOfficeMembers(): Promise<TeamMember[]> {
  const teamId = await getActiveTeamId()
  if (teamId == null) return []
  return listMembers(teamId)
}

/** 读取当前团队真实任务（GET /teams/:id/tasks，取第一页） */
export async function fetchOfficeTasks(): Promise<TeamTask[]> {
  const teamId = await getActiveTeamId()
  if (teamId == null) return []
  const page = await listTasks(teamId, { page: 1, pageSize: 200 })
  return page?.list ?? []
}

/** PATCH 任务状态流转：pending→in_progress→completed，failed→pending 可重试 */
export async function updateOfficeTaskStatus(
  teamId: number,
  taskId: number,
  status: TeamTaskStatus,
): Promise<TeamTask> {
  return updateTask(teamId, taskId, { status })
}

/** 失败任务重试：failed → pending */
export async function retryOfficeTask(
  teamId: number,
  taskId: number,
): Promise<TeamTask> {
  return updateTask(teamId, taskId, { status: 'pending' })
}

class OfficeBridge {
  /** 用户发送消息 */
  onChatMessageSent() {}

  /** AI开始生成回复 */
  onReplyGenerated() {}

  /** 工具调用 */
  onToolCall(_toolName: string) {}

  /** 检索类工具调用 */
  onAgentRetrieve() {}

  /** 积分扣减 */
  onCreditsDeducted(_amount: number) {}

  /** 进入审核阶段 */
  onReview() {}

  /** 任务完成 */
  onTaskComplete() {}

  /** 系统错误 */
  onSystemError(_message: string) {}

  /** 读取当前团队真实成员 */
  getMembers(): Promise<TeamMember[]> {
    return fetchOfficeMembers()
  }

  /** 读取当前团队真实任务 */
  getTasks(): Promise<TeamTask[]> {
    return fetchOfficeTasks()
  }

  /** 任务状态流转（PATCH） */
  setTaskStatus(
    teamId: number,
    taskId: number,
    status: TeamTaskStatus,
  ): Promise<TeamTask> {
    return updateOfficeTaskStatus(teamId, taskId, status)
  }
}

export const officeBridge = new OfficeBridge()
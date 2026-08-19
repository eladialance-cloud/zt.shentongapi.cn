import type { Agent } from '../types/agent'
import type { TeamMember, TeamTask } from '@/types/team'
import { listTeams, listMembers, listTasks } from '@/api/team-api'
import { INITIAL_AGENTS } from '../scene/layout/officeLayout'

let agents: Agent[] = INITIAL_AGENTS.map((a) => ({ ...a }))
let teamId: number | null = null
let members: TeamMember[] = []
let tasks: TeamTask[] = []
let loaded = false

/** 场景名册条目（scene.setRoster 入参，memberId 用于打开任务抽屉） */
export type OfficeRosterEntry = {
  id: string
  name: string
  color: number
  task?: string
  memberId?: number
}

export function getOfficeAgents(): Agent[] {
  return agents
}

export function setOfficeAgents(nextAgents: Agent[]): void {
  agents = nextAgents
}

export function getOfficeTeamId(): number | null {
  return teamId
}

export function getOfficeMembers(): TeamMember[] {
  return members
}

export function getOfficeTasks(): TeamTask[] {
  return tasks
}

/** 团队任务是否已从后端加载成功 */
export function isOfficeDataLoaded(): boolean {
  return loaded
}

/** 按 assigneeMemberId 取成员名下的 team_tasks */
export function getOfficeTasksByMemberId(memberId: number): TeamTask[] {
  return tasks.filter((t) => t.assigneeMemberId === memberId)
}

/** 通过场景 agent id 反查团队成员（兼容 team-<agentId> 与裸 member.id 两种形态） */
export function getOfficeMemberByAgentId(agentId: string): TeamMember | undefined {
  return members.find(
    (m) => 'team-' + m.agentId === agentId || String(m.id) === agentId,
  )
}

function hexToNumber(hex?: string): number | null {
  if (!hex) return null
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  return parseInt(m[1], 16)
}

/** 团队成员 → 场景 Agent（沿用 INITIAL_AGENTS 的工位/朝向，仅替换身份与主题色） */
function buildAgentsFromMembers(list: TeamMember[]): Agent[] {
  return list.slice(0, INITIAL_AGENTS.length).map((member, i) => {
    const base = INITIAL_AGENTS[i] ?? INITIAL_AGENTS[0]!
    return {
      ...base,
      id: 'team-' + member.agentId,
      name: member.agentName || member.roleTitle || base.name,
      color: hexToNumber(member.themeColor) ?? base.color,
      currentTask: member.roleTitle || base.currentTask,
      memberId: member.id,
    }
  })
}

/** 当前团队成员 → 场景名册；无成员时返回 null（由调用方走静态兜底） */
export function membersToRoster(): OfficeRosterEntry[] | null {
  if (members.length === 0) return null
  return members.map((member, i) => {
    const base = INITIAL_AGENTS[i % INITIAL_AGENTS.length] ?? INITIAL_AGENTS[0]!
    return {
      id: 'team-' + member.agentId,
      name: member.agentName || member.roleTitle || '员工' + (i + 1),
      color: hexToNumber(member.themeColor) ?? base.color,
      task: member.roleTitle,
      memberId: member.id,
    }
  })
}

/**
 * 刷新办公数据：GET /teams 取首个团队 → GET /teams/:id/members + GET /teams/:id/tasks。
 * 接口失败或无团队时保留静态 INITIAL_AGENTS 兜底并 console.warn。
 */
export async function refreshOfficeData(): Promise<boolean> {
  try {
    const teams = await listTeams()
    const team = teams[0]
    if (!team) {
      console.warn('[officeStore] 未找到团队，保留静态 INITIAL_AGENTS 兜底')
      loaded = false
      return false
    }
    const [memberList, taskPage] = await Promise.all([
      listMembers(team.id),
      listTasks(team.id, { page: 1, pageSize: 200 }),
    ])
    teamId = team.id
    members = Array.isArray(memberList) ? memberList : []
    tasks = taskPage?.list ?? []
    loaded = true
    const nextAgents = buildAgentsFromMembers(members)
    if (nextAgents.length > 0) {
      agents = nextAgents
    }
    return true
  } catch (err) {
    console.warn('[officeStore] 团队数据加载失败，保留静态 INITIAL_AGENTS 兜底:', err)
    return false
  }
}
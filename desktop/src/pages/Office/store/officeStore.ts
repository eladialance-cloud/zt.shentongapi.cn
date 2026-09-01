import type { Agent } from '../types/agent'
import type { TeamMember, TeamTask } from '@/types/team'
import { listTeams, listMembers, listTasks } from '@/api/team-api'
import { listTasks as listMyTasks } from '@/api/task-api'
import { httpClient } from '@/api/http-client'
import { parsePipeline, type TaskOutputItem } from '@/pages/TaskCenter/pipeline'
import { mapTaskStatus } from '@/pages/TaskCenter/unified'
import { INITIAL_AGENTS } from '../scene/layout/officeLayout'

let agents: Agent[] = INITIAL_AGENTS.map((a) => ({ ...a }))
let teamId: number | null = null
let members: TeamMember[] = []
let tasks: TeamTask[] = []
let loaded = false
/** Hermes 拆解流水线映射（agentName/agentId → 当前步骤名），与任务中心同一数据源 */
let pipelineStepByAgentName = new Map<string, string>()
let pipelineStepByAgentId = new Map<number | string, string>()

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

/**
 * 成员当前任务：优先 Hermes 拆解流水线步骤（agentId 精确匹配，其次 agentName 匹配）；
 * 无流水线时回退职能名，再回退该成员最新进行中 team_task 标题（保证空态不白屏）。
 */
function memberCurrentTask(member: TeamMember): string | undefined {
  const byId = pipelineStepByAgentId.get(member.agentId)
  if (byId) return byId
  const byName = pipelineStepByAgentName.get(member.agentName)
  if (byName) return byName
  if (member.roleTitle) return member.roleTitle
  const latestActive = tasks
    .filter((t) => t.assigneeMemberId === member.id && t.status === 'in_progress')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
  return latestActive?.title
}

/**
 * 读取近期的「我的任务」（agent_task）Hermes 拆解流水线（GET /tasks/:id/outputs + parsePipeline），
 * 与任务中心同一数据源：把流水线步骤按 agentName/agentId 映射到办公室成员。
 * 仅取进行中/排队的步骤（已完成步骤不再作为当前任务）；加载失败清空映射，走职能名兜底。
 */
async function loadPipelineSteps(): Promise<void> {
  const freshByName = new Map<string, string>()
  const freshById = new Map<number | string, string>()
  try {
    const page = await listMyTasks({ page: 1, pageSize: 10 })
    const list = Array.isArray(page?.list) ? page.list : []
    const withOutputs = await Promise.all(
      list.map((task) =>
        httpClient
          .get<TaskOutputItem[]>('/tasks/' + task.id + '/outputs')
          .then((outputs) => ({ task, outputs: Array.isArray(outputs) ? outputs : null }))
          .catch(() => ({ task, outputs: null as TaskOutputItem[] | null })),
      ),
    )
    for (const { task, outputs } of withOutputs) {
      const steps = parsePipeline(
        {
          key: 'task:' + task.id,
          source: 'task',
          title: task.title || '',
          status: mapTaskStatus(task.status),
          rawStatus: task.status,
          createdAt: task.createdAt,
        },
        outputs,
      )
      for (const step of steps) {
        if (step.status === 'done') continue
        const agentName = step.agentName?.trim()
        if (agentName && !freshByName.has(agentName)) {
          freshByName.set(agentName, step.step)
        }
        if (step.agentId !== undefined && !freshById.has(step.agentId)) {
          freshById.set(step.agentId, step.step)
        }
      }
    }
  } catch (err) {
    console.warn('[officeStore] Hermes 拆解流水线加载失败，员工当前任务回退职能名:', err)
  }
  pipelineStepByAgentName = freshByName
  pipelineStepByAgentId = freshById
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
      currentTask: memberCurrentTask(member) || base.currentTask,
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
      task: memberCurrentTask(member),
      memberId: member.id,
    }
  })
}

/**
 * 刷新办公数据：GET /teams 取首个团队 → GET /teams/:id/members + GET /teams/:id/tasks；
 * 同时读取近期的「我的任务」Hermes 拆解流水线（与任务中心同一数据源）驱动员工当前任务。
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
    await loadPipelineSteps()
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

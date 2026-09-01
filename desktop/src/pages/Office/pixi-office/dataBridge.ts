import type { TeamMember } from '../../../types/team'
import type { HermesInstance } from '../../../types/hermes'
import type { OfficeAgent, OfficeDesk, OfficeAgentState } from './types'
import { computeDeskPositions } from './layout'
import type { OfficeLayoutConfig } from './types'

/** 默认角色配色（用于没有 themeColor 的成员） */
const DEFAULT_COLORS = [
  '#4F6EF7', '#34D399', '#F59E0B', '#F87171',
  '#A78BFA', '#60A5FA', '#FB923C', '#2DD4BF',
]

/** 默认角色表情 */
const DEFAULT_EMOJIS = ['👔', '💻', '📊', '💰', '🎯', '📝', '🔧', '📡']

/**
 * 将团队API数据 + Hermes实例状态映射为办公室可视化Agent
 */
export function mapTeamToOfficeAgents(
  members: TeamMember[],
  instances: HermesInstance[],
  layoutConfig: OfficeLayoutConfig,
  sceneWidth: number,
  sceneHeight: number,
): { agents: OfficeAgent[]; desks: OfficeDesk[] } {
  // 只取激活的成员，按 sortOrder 排列
  const active = members
    .filter((m) => m.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const agentCount = active.length
  if (agentCount === 0) return { agents: [], desks: [] }

  const desks = computeDeskPositions(layoutConfig, agentCount, sceneWidth, sceneHeight)

  // 构建 instanceStatus 映射
  const statusMap = new Map<string, 'running' | 'stopped' | 'error'>()
  for (const inst of instances) {
    statusMap.set(String(inst.id), inst.status as 'running' | 'stopped' | 'error')
  }

  const agents: OfficeAgent[] = active.map((member, i) => {
    const desk = desks[i]!
    const color = member.themeColor || DEFAULT_COLORS[i % DEFAULT_COLORS.length]!
    const emoji = member.roleEmoji || DEFAULT_EMOJIS[i % DEFAULT_EMOJIS.length]!
    const instStatus = statusMap.get(String(member.agentId))

    // 根据 Hermes 实例状态推断视觉状态
    const visualState: OfficeAgentState =
      instStatus === 'running' ? 'working' :
      instStatus === 'error' ? 'idle' :
      'idle'

    return {
      id: `agent-${member.agentId}`,
      name: member.agentName,
      role: member.roleTitle,
      emoji,
      color,
      state: visualState,
      task: visualState === 'working' ? `${member.roleTitle}工作中…` : '空闲中',
      x: desk.seatX,
      y: desk.seatY,
      deskId: desk.id,
      facing: 1,
      instanceStatus: instStatus,
    }
  })

  return { agents, desks }
}

/**
 * 从颜色字符串生成 HSL 调整值（用于 hover 高亮等）
 */
export function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0xff) + amount))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

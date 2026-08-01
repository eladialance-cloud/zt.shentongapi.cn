/**
 * AI办公室 - Office配置与Agent数据模型
 * 提供 Hermes实例映射、团队Agent映射、看板数据等
 */

import type { HermesInstance } from '@/types/hermes'
import type { Team } from '@/types/team'

/** Agent外观颜色主题 */
export const OUTFIT_COLORS: Record<string, string> = {
  cyan:   '#00d4ff',
  purple: '#b026ff',
  green:  '#00ff88',
  orange: '#ffaa00',
  blue:   '#4488ff',
  white:  '#e0e0e0',
};

/** Agent工作状态 */
export type AgentStatus = 'working' | 'idle' | 'error' | 'meeting' | 'dispatching' | 'walking';

/** Agent配饰类型 */
export type AccessoryType = 'glasses' | 'pen' | 'toolbelt' | 'folder' | 'headphones' | 'bulb';

/** Agent信息模型 */
export interface AgentInfo {
  id: number;
  /** 所属团队ID */
  teamId: number;
  name: string;
  position: string;
  status: AgentStatus;
  outfit: keyof typeof OUTFIT_COLORS;
  accessory: AccessoryType;
  currentTask: string | null;
  progress: number;
  skills: string[];
  /** 在画布中的位置坐标(%) */
  posX?: number;
  posY?: number;
}

/** Hermes实例状态 -> AgentStatus 映射 */
function mapHermesStatus(status: string): AgentStatus {
  switch (status) {
    case 'running': return 'working';
    case 'stopped': return 'idle';
    case 'error': return 'error';
    default: return 'idle';
  }
}

const OUTFIT_KEYS = Object.keys(OUTFIT_COLORS) as Array<keyof typeof OUTFIT_COLORS>;
const ACCESSORIES: AccessoryType[] = ['glasses', 'pen', 'toolbelt', 'folder', 'headphones', 'bulb'];

/** 从Hermes实例列表生成AgentInfo */
export function hermesToAgents(instances: HermesInstance[]): AgentInfo[] {
  if (!instances || instances.length === 0) return [];
  return instances.map((inst, idx) => {
    const status = mapHermesStatus(inst.status);
    return {
      id: inst.id,
      teamId: 0,
      name: inst.name,
      position: `Agent #${inst.id}`,
      status,
      outfit: OUTFIT_KEYS[idx % OUTFIT_KEYS.length],
      accessory: ACCESSORIES[idx % ACCESSORIES.length],
      currentTask: status === 'working' ? '进行中' : null,
      progress: status === 'working' ? Math.min(100, (inst.resourceUsage?.cpuPercent ?? 0)) : 0,
      skills: inst.skillIds ? inst.skillIds.map((s) => `技能${s}`) : ['通用'],
      posX: 50,
      posY: 50,
    };
  });
}

/** Agent区域映射 */
export const AGENT_ZONE_MAP: Record<number, string> = {
  1: 'workstation_a',
  2: 'workstation_b',
  3: 'workstation_c',
  4: 'meetingRoom',
  5: 'workstation_b',
  6: 'lounge',
};

/** 服务机架信息 */
export interface ServerRack {
  id: string;
  name: string;
  icon: string;
  running: boolean;
  cpu: number;
  memory: number;
  color: string;
  /** 是否为云端服务 */
  cloud?: boolean;
}

/** 看板列定义 */
export interface KanbanColumn {
  key: AgentStatus | 'todo' | 'done';
  title: string;
  color: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: 'todo',    title: '待办',   color: 'var(--color-text-tertiary)' },
  { key: 'working', title: '进行中', color: '#00d4ff' },
  { key: 'done',    title: '已完成', color: '#00ff88' },
  { key: 'error',   title: '异常',   color: '#ff0080' },
];

// ============================================================
// Team -> AgentInfo 映射
// ============================================================

/**
 * 从 team 成员 + Hermes 实例生成 AgentInfo 列表
 * - 若 instances 中有对应 agentId 的实例，使用实例数据
 * - 无实例的成员显示为 idle 状态
 * - outfit/accessory 基于 agentId 哈希分配
 */
export function teamMembersToAgents(
  teams: Team[],
  agentIdsByTeam: Record<number, Array<{ teamId: number; agentId: number }>>,
  instances: HermesInstance[]
): AgentInfo[] {
  const outfitKeys = Object.keys(OUTFIT_COLORS) as Array<keyof typeof OUTFIT_COLORS>
  const accessoryKeys: AccessoryType[] = ['glasses', 'pen', 'toolbelt', 'folder', 'headphones', 'bulb']

  // 构建 Hermes 实例映射表
  const instanceMap = new Map<number, HermesInstance>()
  for (const inst of instances) {
    instanceMap.set(inst.id, inst)
  }

  const agents: AgentInfo[] = []
  for (const team of teams) {
    const teamAgents = agentIdsByTeam[team.id] ?? []
    for (const { agentId } of teamAgents) {
      const inst = instanceMap.get(agentId)
      const name = inst?.name ?? `Agent #${agentId}`
      const status: AgentStatus = inst ? mapHermesStatus(inst.status) : 'idle'
      const hash = Math.abs(hashCode(name + agentId))
      agents.push({
        id: agentId,
        teamId: team.id,
        name,
        position: `Agent #${agentId}`,
        status,
        outfit: outfitKeys[hash % outfitKeys.length],
        accessory: accessoryKeys[hash % accessoryKeys.length],
        currentTask: status === 'working' ? '处理任务中' : null,
        progress: status === 'working' ? Math.min(100, inst?.resourceUsage?.cpuPercent ?? 0) : 0,
        skills: inst?.skillIds ? inst.skillIds.map((s) => `技能${s}`) : ['通用'],
        posX: 0,
        posY: 0,
      })
    }
  }
  return agents
}

/** 简单字符串哈希 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash;
  }
  return hash
}

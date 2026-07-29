/**
 * AI办公室 — 区域/工位坐标配置
 */

import type { HermesInstance } from '@/types/hermes'
import type { OPCTeam } from '@/types/opc'

/** 岗位配色映射 */
export const OUTFIT_COLORS: Record<string, string> = {
  cyan:   '#00d4ff',
  purple: '#b026ff',
  green:  '#00ff88',
  orange: '#ffaa00',
  blue:   '#4488ff',
  white:  '#e0e0e0',
};

/** 状态枚举 */
export type AgentStatus = 'working' | 'idle' | 'error' | 'meeting' | 'dispatching' | 'walking';

export type AccessoryType = 'glasses' | 'pen' | 'toolbelt' | 'folder' | 'headphones' | 'bulb';

/** Agent数据接口 */
export interface AgentInfo {
  id: number;
  /** 关联的 OPC 团队 ID */
  teamId: number;
  name: string;
  position: string;
  status: AgentStatus;
  outfit: keyof typeof OUTFIT_COLORS;
  accessory: AccessoryType;
  currentTask: string | null;
  progress: number;
  skills: string[];
  /** 在区域中的相对位置 (%) */
  posX?: number;
  posY?: number;
}

/** Hermes实例状态 → AgentStatus 映射 */
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
      currentTask: status === 'working' ? '中' : null,
      progress: status === 'working' ? Math.min(100, (inst.resourceUsage?.cpuPercent ?? 0)) : 0,
      skills: inst.skillIds ? inst.skillIds.map((s) => `技能#${s}`) : ['通用'],
      posX: 50,
      posY: 50,
    };
  });
}

/** Agent →  */
export const AGENT_ZONE_MAP: Record<number, string> = {
  1: 'workstation_a',
  2: 'workstation_b',
  3: 'workstation_c',
  4: 'meetingRoom',
  5: 'workstation_b',
  6: 'lounge',
};

/** 服务器机柜信息 */
export interface ServerRack {
  id: string;
  name: string;
  icon: string;
  running: boolean;
  cpu: number;
  memory: number;
  color: string;
  /** 标记为云端服务（非本地进程） */
  cloud?: boolean;
}

/** 看板列定义 */
export interface KanbanColumn {
  key: AgentStatus | 'todo' | 'done';
  title: string;
  color: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: 'todo',        title: '待办',     color: 'var(--color-text-tertiary)' },
  { key: 'working',     title: '中',   color: '#00d4ff' },
  { key: 'done',        title: '已完成',   color: '#00ff88' },
  { key: 'error',       title: '异常',     color: '#ff0080' },
];

// ============================================================
// OPC 团队驱动的动态区域
// ============================================================

/**
 * 将 OPC 团队 Agent 仓库 + Hermes 实例映射为 AgentInfo
 * - 用 instances 的 id 匹配 agentId 获取 Agent 详情（名称、状态、技能）
 * - 找不到匹配 Hermes 实例时使用兜底值
 * - outfit/accessory 根据 agentId 哈希分配
 */
export function teamMembersToAgents(
  teams: OPCTeam[],
  agentIdsByTeam: Record<number, Array<{ teamId: number; agentId: number }>>,
  instances: HermesInstance[]
): AgentInfo[] {
  const outfitKeys = Object.keys(OUTFIT_COLORS) as Array<keyof typeof OUTFIT_COLORS>
  const accessoryKeys: AccessoryType[] = ['glasses', 'pen', 'toolbelt', 'folder', 'headphones', 'bulb']

  // 构建 Hermes 实例查找表
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
        skills: inst?.skillIds ? inst.skillIds.map((s) => `技能#${s}`) : ['通用'],
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
    hash = hash & hash // 转为32位整数
  }
  return hash
}

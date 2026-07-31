/**
 * AI鍔炲叕瀹?鈥?鍖哄煙/宸ヤ綅鍧愭爣閰嶇疆
 */

import type { HermesInstance } from '@/types/hermes'
import type { Team } from '@/types/team'

/** 宀椾綅閰嶈壊鏄犲皠 */
export const OUTFIT_COLORS: Record<string, string> = {
  cyan:   '#00d4ff',
  purple: '#b026ff',
  green:  '#00ff88',
  orange: '#ffaa00',
  blue:   '#4488ff',
  white:  '#e0e0e0',
};

/** 鐘舵€佹灇涓?*/
export type AgentStatus = 'working' | 'idle' | 'error' | 'meeting' | 'dispatching' | 'walking';

export type AccessoryType = 'glasses' | 'pen' | 'toolbelt' | 'folder' | 'headphones' | 'bulb';

/** Agent鏁版嵁鎺ュ彛 */
export interface AgentInfo {
  id: number;
  /** 鍏宠仈鐨?team 鍥㈤槦 ID */
  teamId: number;
  name: string;
  position: string;
  status: AgentStatus;
  outfit: keyof typeof OUTFIT_COLORS;
  accessory: AccessoryType;
  currentTask: string | null;
  progress: number;
  skills: string[];
  /** 鍦ㄥ尯鍩熶腑鐨勭浉瀵逛綅缃?(%) */
  posX?: number;
  posY?: number;
}

/** Hermes瀹炰緥鐘舵€?鈫?AgentStatus 鏄犲皠 */
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
      currentTask: status === 'working' ? '进行中' : null,
      progress: status === 'working' ? Math.min(100, (inst.resourceUsage?.cpuPercent ?? 0)) : 0,
      skills: inst.skillIds ? inst.skillIds.map((s) => `技能${s}`) : ['通用'],
      posX: 50,
      posY: 50,
    };
  });
}

/** Agent 鈫? */
export const AGENT_ZONE_MAP: Record<number, string> = {
  1: 'workstation_a',
  2: 'workstation_b',
  3: 'workstation_c',
  4: 'meetingRoom',
  5: 'workstation_b',
  6: 'lounge',
};

/** 鏈嶅姟鍣ㄦ満鏌滀俊鎭?*/
export interface ServerRack {
  id: string;
  name: string;
  icon: string;
  running: boolean;
  cpu: number;
  memory: number;
  color: string;
  /** 鏍囪涓轰簯绔湇鍔★紙闈炴湰鍦拌繘绋嬶級 */
  cloud?: boolean;
}

/** 鐪嬫澘鍒楀畾涔?*/
export interface KanbanColumn {
  key: AgentStatus | 'todo' | 'done';
  title: string;
  color: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { key: 'todo',        title: '待办',     color: 'var(--color-text-tertiary)' },
  { key: 'working',     title: '进行中',   color: '#00d4ff' },
  { key: 'done',        title: '已完成',   color: '#00ff88' },
  { key: 'error',       title: '寮傚父',     color: '#ff0080' },
];

// ============================================================
// team 鍥㈤槦椹卞姩鐨勫姩鎬佸尯鍩?// ============================================================

/**
 * 灏?team 鍥㈤槦 Agent 浠撳簱 + Hermes 瀹炰緥鏄犲皠涓?AgentInfo
 * - 鐢?instances 鐨?id 鍖归厤 agentId 鑾峰彇 Agent 璇︽儏锛堝悕绉般€佺姸鎬併€佹妧鑳斤級
 * - 鎵句笉鍒板尮閰?Hermes 瀹炰緥鏃朵娇鐢ㄥ厹搴曞€? * - outfit/accessory 鏍规嵁 agentId 鍝堝笇鍒嗛厤
 */
export function teamMembersToAgents(
  teams: Team[],
  agentIdsByTeam: Record<number, Array<{ teamId: number; agentId: number }>>,
  instances: HermesInstance[]
): AgentInfo[] {
  const outfitKeys = Object.keys(OUTFIT_COLORS) as Array<keyof typeof OUTFIT_COLORS>
  const accessoryKeys: AccessoryType[] = ['glasses', 'pen', 'toolbelt', 'folder', 'headphones', 'bulb']

  // 鏋勫缓 Hermes 瀹炰緥鏌ユ壘琛
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

/** 绠€鍗曞瓧绗︿覆鍝堝笇 */
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash; // 转为32位整数
  }
  return hash
}

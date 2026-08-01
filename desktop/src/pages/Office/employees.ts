/**
 * 默认5个AI员工定义 + 动态团队员工创建
 */

import type { AIEmployee } from './types';
import { COLORS, WORKSTATION_XS, WORKSTATION_Y } from './office-2d-config';

/** 创建初始员工实例 */
function makeEmployees(now: number): AIEmployee[] {
  return [
    {
      id: 'business',
      name: '商务AI',
      emoji: '\u{1F454}',
      role: 'business',
      themeColor: COLORS.business,
      themeColorLight: COLORS.businessLight,
      workstation: { x: WORKSTATION_XS[0], y: WORKSTATION_Y },
      currentPos: { x: WORKSTATION_XS[0], y: WORKSTATION_Y },
      targetPos: { x: WORKSTATION_XS[0], y: WORKSTATION_Y },
      status: 'IDLE',
      statusStartTime: now,
      path: [],
      todayCompleted: 12,
      todoCount: 3,
      moveSpeed: 60,
      charTemplateDir: 'office/iso/characters/ai-employee-01',
    },
    {
      id: 'content',
      name: '内容AI',
      emoji: '\u{1F4DD}',
      role: 'content',
      themeColor: COLORS.content,
      themeColorLight: COLORS.contentLight,
      workstation: { x: WORKSTATION_XS[1], y: WORKSTATION_Y },
      currentPos: { x: WORKSTATION_XS[1], y: WORKSTATION_Y },
      targetPos: { x: WORKSTATION_XS[1], y: WORKSTATION_Y },
      status: 'WORKING',
      statusStartTime: now,
      path: [],
      todayCompleted: 8,
      todoCount: 5,
      moveSpeed: 60,
      charTemplateDir: 'office/iso/characters/ai-employee-02',
    },
    {
      id: 'delivery',
      name: '交付AI',
      emoji: '\u{1F6EE}',
      role: 'delivery',
      themeColor: COLORS.delivery,
      themeColorLight: COLORS.deliveryLight,
      workstation: { x: WORKSTATION_XS[2], y: WORKSTATION_Y },
      currentPos: { x: WORKSTATION_XS[2], y: WORKSTATION_Y },
      targetPos: { x: WORKSTATION_XS[2], y: WORKSTATION_Y },
      status: 'WORKING_DEEP',
      statusStartTime: now,
      path: [],
      todayCompleted: 15,
      todoCount: 1,
      moveSpeed: 60,
      charTemplateDir: 'office/iso/characters/ai-employee-03',
    },
    {
      id: 'finance',
      name: '财务AI',
      emoji: '\u{1F4B0}',
      role: 'finance',
      themeColor: COLORS.finance,
      themeColorLight: COLORS.financeLight,
      workstation: { x: WORKSTATION_XS[3], y: WORKSTATION_Y },
      currentPos: { x: WORKSTATION_XS[3], y: WORKSTATION_Y },
      targetPos: { x: WORKSTATION_XS[3], y: WORKSTATION_Y },
      status: 'IN_MEETING',
      statusStartTime: now,
      path: [],
      todayCompleted: 5,
      todoCount: 7,
      moveSpeed: 60,
      charTemplateDir: 'office/iso/characters/ai-employee-04',
    },
    {
      id: 'service',
      name: '客服AI',
      emoji: '\u{1F4AC}',
      role: 'service',
      themeColor: COLORS.service,
      themeColorLight: COLORS.serviceLight,
      workstation: { x: WORKSTATION_XS[4], y: WORKSTATION_Y },
      currentPos: { x: WORKSTATION_XS[4], y: WORKSTATION_Y },
      targetPos: { x: WORKSTATION_XS[4], y: WORKSTATION_Y },
      status: 'RESTING',
      statusStartTime: now,
      path: [],
      todayCompleted: 20,
      todoCount: 0,
      moveSpeed: 60,
      charTemplateDir: 'office/iso/characters/ai-employee-05',
    },
  ];
}

/** 默认AI员工列表 */
export const AI_EMPLOYEES = makeEmployees(Date.now());

/** 创建默认任务流边 */
export function createDefaultTaskFlowEdges(): Array<{ id: string; fromEmployeeId: string; toEmployeeId: string; active: boolean; particles: Array<{ progress: number }> }> {
  return [
    { id: 'flow-1', fromEmployeeId: 'content', toEmployeeId: 'delivery', active: true, particles: [] },
    { id: 'flow-2', fromEmployeeId: 'business', toEmployeeId: 'content', active: true, particles: [] },
    { id: 'flow-3', fromEmployeeId: 'delivery', toEmployeeId: 'finance', active: false, particles: [] },
    { id: 'flow-4', fromEmployeeId: 'service', toEmployeeId: 'business', active: true, particles: [] },
  ];
}

/** 创建员工 (刷新时间戳) */
export function createEmployees(now?: number): AIEmployee[] {
  return makeEmployees(now ?? Date.now());
}

/**
 * 从团队数据创建动态员工
 * 循环使用5套精灵图模板
 */
export function createEmployeesFromTeam(
  members: Array<{ id: number; name: string; role?: string }>,
  now?: number
): AIEmployee[] {
  const ts = now ?? Date.now();
  const colorKeys = ['business', 'content', 'delivery', 'finance', 'service'] as const;
  const templateDirs = [
    'office/iso/characters/ai-employee-01',
    'office/iso/characters/ai-employee-02',
    'office/iso/characters/ai-employee-03',
    'office/iso/characters/ai-employee-04',
    'office/iso/characters/ai-employee-05',
  ];

  return members.map((m, idx) => {
    const colorKey = colorKeys[idx % colorKeys.length];
    const xIdx = Math.min(idx, WORKSTATION_XS.length - 1);
    return {
      id: `team-${m.id}`,
      name: m.name,
      emoji: '\u{1F916}',
      role: m.role || 'team_member',
      themeColor: COLORS[colorKey],
      themeColorLight: (COLORS as Record<string, string>)[`${colorKey}Light`] || COLORS.businessLight,
      workstation: { x: WORKSTATION_XS[xIdx], y: WORKSTATION_Y },
      currentPos: { x: WORKSTATION_XS[xIdx], y: WORKSTATION_Y },
      targetPos: { x: WORKSTATION_XS[xIdx], y: WORKSTATION_Y },
      status: 'IDLE' as const,
      statusStartTime: ts,
      path: [],
      todayCompleted: 0,
      todoCount: 0,
      moveSpeed: 60,
      charTemplateDir: templateDirs[idx % templateDirs.length],
    };
  });
}

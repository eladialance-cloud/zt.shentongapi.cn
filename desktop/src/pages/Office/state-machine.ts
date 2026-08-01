/**
 * AI办公室 2D画布 - 状态机 (9种状态)
 *
 * 优先级:
 *   P0: IN_MEETING (0), IDLE (1)  - 用户对话可打断
 *   P1: WORKING/WORKING_DEEP (2), MOVING/VISITING/AT_RESOURCE (3)
 *   P2: RESTING (4)               - 永不主动打断
 *   OFFLINE (5)
 */

import type { AIEmployeeStatus } from './types';

/** 状态优先级 (数字越小优先级越高) */
export const STATE_PRIORITY: Record<AIEmployeeStatus, number> = {
  IN_MEETING: 0,
  IDLE: 1,
  WORKING: 2,
  WORKING_DEEP: 2,
  MOVING: 3,
  VISITING: 3,
  AT_RESOURCE: 3,
  RESTING: 4,
  OFFLINE: 5,
};

/** 状态中文名称 */
export const STATE_LABELS: Record<AIEmployeeStatus, string> = {
  IDLE: '空闲',
  WORKING: '工作中',
  WORKING_DEEP: '深度工作',
  MOVING: '移动中',
  VISITING: '拜访中',
  IN_MEETING: '会议中',
  AT_RESOURCE: '查阅资源',
  RESTING: '休息中',
  OFFLINE: '离线',
};

/** 状态对应视觉颜色 (CSS var 或 hex) */
export function getStatusVisualColor(status: AIEmployeeStatus): string {
  switch (status) {
    case 'IDLE':
    case 'RESTING':
      return '#52C41A';
    case 'WORKING':
    case 'WORKING_DEEP':
      return '#FA8C16';
    case 'MOVING':
    case 'VISITING':
    case 'IN_MEETING':
    case 'AT_RESOURCE':
      return '#1677FF';
    case 'OFFLINE':
      return '#9CA3AF';
  }
}

/** 状态光晕颜色 (用于深度工作红色光晕/失败红闪等) */
export function getStatusHaloColor(status: AIEmployeeStatus): string {
  switch (status) {
    case 'WORKING_DEEP':
      return 'rgba(255, 77, 79, 0.35)';
    case 'IN_MEETING':
      return 'rgba(22, 119, 255, 0.30)';
    case 'IDLE':
    case 'RESTING':
      return 'rgba(82, 196, 26, 0.25)';
    case 'OFFLINE':
      return 'rgba(156, 163, 175, 0.20)';
    default:
      return 'rgba(250, 140, 22, 0.25)';
  }
}

/**
 * 判断是否可以从 current 转到 next。
 * 规则: 优先级更高或相同的可以打断; 优先级更低的不能打断。
 * OFFLINE 状态: 任何状态可离线 (用户停止), 离线->IDLE 可恢复。
 */
export function canTransition(current: AIEmployeeStatus, next: AIEmployeeStatus): boolean {
  if (current === next) return true;
  // OFFLINE 可被切换到 IDLE (恢复), 或被强制切换到任意状态(用户干预)
  if (current === 'OFFLINE') return true;
  if (next === 'OFFLINE') return true;
  const currentPriority = STATE_PRIORITY[current];
  const nextPriority = STATE_PRIORITY[next];
  return nextPriority <= currentPriority;
}

/** 状态切换动画时长(ms) */
export function transitionDuration(current: AIEmployeeStatus, next: AIEmployeeStatus): number {
  if (next === 'OFFLINE') return 800;     // 离线淡出
  if (current === 'OFFLINE') return 800;  // 上线伸展
  if (current === 'WORKING' && next === 'IDLE') return 500;
  if (current === 'IDLE' && next === 'WORKING') return 500;
  return 500;
}

/** 状态对应"动作"枚举, 用于渲染器选择绘制姿态 */
export type EmployeePose =
  | 'sit_idle'        // 坐着
  | 'sit_working'     // 前倾打字
  | 'sit_deep'        // 深度工作 (红色光晕)
  | 'stand_move'      // 站立移动
  | 'stand_visit'     // 拜访 (气泡)
  | 'sit_meeting'     // 会议室就座
  | 'stand_resource'  // 查阅资源
  | 'sit_rest'        // 休息喝咖啡
  | 'lie_offline';    // 趴下离线

export function getPose(status: AIEmployeeStatus): EmployeePose {
  switch (status) {
    case 'IDLE': return 'sit_idle';
    case 'WORKING': return 'sit_working';
    case 'WORKING_DEEP': return 'sit_deep';
    case 'MOVING': return 'stand_move';
    case 'VISITING': return 'stand_visit';
    case 'IN_MEETING': return 'sit_meeting';
    case 'AT_RESOURCE': return 'stand_resource';
    case 'RESTING': return 'sit_rest';
    case 'OFFLINE': return 'lie_offline';
  }
}

/** 状态在工位还是离开工位 */
export function isAtWorkstation(status: AIEmployeeStatus): boolean {
  switch (status) {
    case 'IDLE':
    case 'WORKING':
    case 'WORKING_DEEP':
    case 'OFFLINE':
      return true;
    case 'MOVING':
    case 'VISITING':
    case 'IN_MEETING':
    case 'AT_RESOURCE':
    case 'RESTING':
      return false;
  }
}

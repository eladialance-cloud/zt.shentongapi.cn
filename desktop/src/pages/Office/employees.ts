/**
 * 5 AI 员工定义 (v0.3.1 Task 8)
 */

import type { AIEmployee } from './types';
import { COLORS, WORKSTATION_XS, WORKSTATION_Y } from './office-2d-config';

/** 创建初始员工实例 (statusStartTime 调用时填) */
function makeEmployees(now: number): AIEmployee[] {
  return [
    {
      id: 'business',
      name: '商务AI',
      emoji: '💼',
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
      emoji: '📝',
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
      emoji: '🚚',
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
      todoCount: 2,
      moveSpeed: 60,
      charTemplateDir: 'office/iso/characters/ai-employee-03',
    },
    {
      id: 'finance',
      name: '财务AI',
      emoji: '💰',
      role: 'finance',
      themeColor: COLORS.finance,
      themeColorLight: COLORS.financeLight,
      workstation: { x: WORKSTATION_XS[3], y: WORKSTATION_Y },
      currentPos: { x: WORKSTATION_XS[3], y: WORKSTATION_Y },
      targetPos: { x: WORKSTATION_XS[3], y: WORKSTATION_Y },
      status: 'IDLE',
      statusStartTime: now,
      path: [],
      todayCompleted: 6,
      todoCount: 1,
      moveSpeed: 60,
      charTemplateDir: 'office/iso/characters/ai-employee-04',
    },
    {
      id: 'service',
      name: '客服AI',
      emoji: '🎧',
      role: 'service',
      themeColor: COLORS.service,
      themeColorLight: COLORS.serviceLight,
      workstation: { x: WORKSTATION_XS[4], y: WORKSTATION_Y },
      currentPos: { x: WORKSTATION_XS[4], y: WORKSTATION_Y },
      targetPos: { x: WORKSTATION_XS[4], y: WORKSTATION_Y },
      status: 'WORKING',
      statusStartTime: now,
      path: [],
      todayCompleted: 24,
      todoCount: 7,
      moveSpeed: 60,
      charTemplateDir: 'office/iso/characters/ai-employee-05',
    },
  ];
}

/** 工位装饰 (角色相关) — 由 renderer 读取, 此处仅声明 */
export interface WorkstationDecor {
  employeeId: string;
  /** 桌面物件名 */
  items: string[];
  /** 显示器内容描述 */
  screenLabel: string;
}

export const WORKSTATION_DECORS: WorkstationDecor[] = [
  {
    employeeId: 'business',
    items: ['名片夹', '电话', '合同夹'],
    screenLabel: '客户漏斗图',
  },
  {
    employeeId: 'content',
    items: ['素材板', '迷你相机', '调色板'],
    screenLabel: '内容编辑预览',
  },
  {
    employeeId: 'delivery',
    items: ['项目看板', '计时器', '甘特图'],
    screenLabel: '项目进度',
  },
  {
    employeeId: 'finance',
    items: ['计算器', '财报架', '图表册'],
    screenLabel: '收支趋势',
  },
  {
    employeeId: 'service',
    items: ['工单架', '耳麦', 'FAQ手册'],
    screenLabel: '工单队列',
  },
];

/** 工厂函数: 创建一份初始员工 */
export function createEmployees(): AIEmployee[] {
  return makeEmployees(Date.now());
}

/** 默认员工列表 (兼容静态导入; statusStartTime=0, 由组件创建时覆盖) */
export const AI_EMPLOYEES: AIEmployee[] = makeEmployees(0);

/** 默认任务流边 (员工之间流转关系) */
export function createDefaultTaskFlowEdges() {
  return [
    { id: 'tf-business-content', fromEmployeeId: 'business', toEmployeeId: 'content', active: true,  particles: [{ progress: 0.0 }] },
    { id: 'tf-content-delivery', fromEmployeeId: 'content',  toEmployeeId: 'delivery', active: true, particles: [{ progress: 0.3 }] },
    { id: 'tf-delivery-finance', fromEmployeeId: 'delivery', toEmployeeId: 'finance', active: false, particles: [] },
    { id: 'tf-business-finance', fromEmployeeId: 'business', toEmployeeId: 'finance', active: true,  particles: [{ progress: 0.6 }] },
    { id: 'tf-delivery-service', fromEmployeeId: 'delivery', toEmployeeId: 'service', active: true,  particles: [{ progress: 0.1 }] },
    { id: 'tf-service-business', fromEmployeeId: 'service',  toEmployeeId: 'business', active: false, particles: [] },
  ];
}

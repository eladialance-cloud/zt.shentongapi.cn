/**
 * scenarios/index.ts — Demo 场景索引
 *
 * Task 10.3: 集中导出 3 个 Demo 控制器，供 Office2DPage 注册与触发。
 */

import type { DemoController } from '../types';
import { monthlyReportDemo } from './MonthlyReportDemo';
import { skillVisitDemo } from './SKILLVisitDemo';
import { voiceMeetingDemo } from './VoiceMeetingDemo';

/** 全部 Demo 控制器列表 */
export const DEMO_LIST: DemoController[] = [
  monthlyReportDemo,
  skillVisitDemo,
  voiceMeetingDemo,
];

export { monthlyReportDemo, skillVisitDemo, voiceMeetingDemo };

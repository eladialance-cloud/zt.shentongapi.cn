/**
 * MonthlyReportDemo — 上月经营分析报告（多 AI 协同）
 *
 * Task 10.1: 完整流程：
 *   前台（商务AI）→ 财务AI（收集数据）→ 内容AI（撰写报告）→ 交付AI（最终交付）→ 结果汇聚
 *
 * Demo 通过 DemoContext 控制：
 *   - setEmployeeStatus: 切换状态
 *   - addBubble: 添加对话气泡
 *   - moveEmployee: 移动员工（A* 寻路）
 *   - showProgress: 更新进度条
 *   - showNarration: 显示底部解说
 */

import type { DemoController, DemoContext } from '../types';
import { cancelableSleep, createCancellation, demoStep } from './demo-helpers';

/** Demo 资源目标点（与 office-2d-config 中的 RESOURCE_TARGETS 一致） */
const POS = {
  businessWorkstation: { x: 300, y: 400 },
  contentWorkstation: { x: 440, y: 400 },
  deliveryWorkstation: { x: 580, y: 400 },
  financeWorkstation: { x: 720, y: 400 },
  reception: { x: 600, y: 745 },
  meetingRoom: { x: 140, y: 640 },
};

/** Demo 控制器实例 */
export const monthlyReportDemo: DemoController = {
  id: 'monthly-report',
  title: '上月经营分析报告',
  description: '多 AI 协同：商务AI 发起 → 财务AI 数据 → 内容AI 撰写 → 交付AI 汇聚',
  play,
  stop,
};

const cancellation = createCancellation();

async function play(ctx: DemoContext): Promise<void> {
  cancellation.reset();

  // ===== Step 1: 商务AI 发起任务（5% → 20%） =====
  await demoStep(ctx, cancellation.isCancelled, 5, '商务AI 发起报告请求', '商务AI 接收用户请求，准备发起上月经营分析报告流程。', 800);
  if (cancellation.isCancelled()) return;

  ctx.setEmployeeStatus('business', 'WORKING');
  ctx.addBubble('business', 'text', '请准备上月经营分析报告', '💬', 2500);
  await demoStep(ctx, cancellation.isCancelled, 15, '商务AI 工作中', '商务AI 正在准备报告请求并发送给财务AI。', 1500);
  if (cancellation.isCancelled()) return;

  // ===== Step 2: 商务AI 移动到财务AI 工位旁（20% → 35%） =====
  ctx.showProgress(20, '商务AI 前往财务AI 工位');
  ctx.showNarration('商务AI 起身前往财务AI 工位旁，发起数据请求。');
  ctx.setEmployeeStatus('business', 'MOVING');
  // 商务AI 移动到财务工位附近
  await ctx.moveEmployee('business', { x: POS.financeWorkstation.x - 50, y: POS.financeWorkstation.y }, 80);
  if (cancellation.isCancelled()) return;

  ctx.setEmployeeStatus('business', 'VISITING');
  ctx.addBubble('business', 'icon', '需要数据', '📊', 2000);
  ctx.setEmployeeStatus('finance', 'WORKING_DEEP');
  await demoStep(ctx, cancellation.isCancelled, 35, '财务AI 接收数据请求', '财务AI 接收请求，进入深度工作模式收集上月财务数据。', 1500);
  if (cancellation.isCancelled()) return;

  // ===== Step 3: 财务AI 处理数据（35% → 55%） =====
  ctx.addBubble('finance', 'thinking', '汇总收支数据...', '💭', 2500);
  await demoStep(ctx, cancellation.isCancelled, 45, '财务AI 处理数据', '财务AI 正在汇总上月收支、成本、利润等关键数据。', 1500);
  if (cancellation.isCancelled()) return;

  ctx.addBubble('finance', 'text', '数据已就绪，请内容AI 撰写', '✅', 2000);
  // 财务AI 触发完成动画
  ctx.setEmployeeStatus('finance', 'IDLE', { x: POS.financeWorkstation.x, y: POS.financeWorkstation.y });
  await demoStep(ctx, cancellation.isCancelled, 55, '财务AI 数据完成', '财务AI 数据准备完毕，已发送给内容AI 撰写报告。', 1200);
  if (cancellation.isCancelled()) return;

  // ===== Step 4: 商务AI 返回工位，内容AI 接手（55% → 75%） =====
  ctx.showProgress(55, '内容AI 接手报告撰写');
  ctx.showNarration('内容AI 接收数据，开始撰写报告正文。');
  ctx.setEmployeeStatus('business', 'MOVING');
  await ctx.moveEmployee('business', POS.businessWorkstation, 80);
  if (cancellation.isCancelled()) return;
  ctx.setEmployeeStatus('business', 'IDLE');

  ctx.setEmployeeStatus('content', 'WORKING_DEEP');
  ctx.addBubble('content', 'thinking', '撰写经营分析报告...', '✍', 2500);
  await demoStep(ctx, cancellation.isCancelled, 70, '内容AI 撰写报告', '内容AI 深度工作中，撰写经营分析报告正文与图表说明。', 1500);
  if (cancellation.isCancelled()) return;

  ctx.addBubble('content', 'text', '报告完成，请交付AI 汇聚', '✅', 2000);
  ctx.setEmployeeStatus('content', 'IDLE');
  await demoStep(ctx, cancellation.isCancelled, 75, '内容AI 报告完成', '内容AI 完成报告，发送给交付AI 进行最终交付。', 1200);
  if (cancellation.isCancelled()) return;

  // ===== Step 5: 交付AI 汇聚结果（75% → 100%） =====
  ctx.showProgress(75, '交付AI 汇聚最终结果');
  ctx.showNarration('交付AI 接收报告，进行格式校验与最终交付。');
  ctx.setEmployeeStatus('delivery', 'WORKING_DEEP');
  await cancelableSleep(800, cancellation.isCancelled);
  if (cancellation.isCancelled()) return;

  ctx.addBubble('delivery', 'text', '报告已交付！', '📦', 2500);
  ctx.setEmployeeStatus('delivery', 'IDLE');
  ctx.setEmployeeStatus('business', 'WORKING');
  await demoStep(ctx, cancellation.isCancelled, 100, '完成', '上月经营分析报告已成功交付。商务AI 将向用户反馈结果。', 1500);
}

function stop(): void {
  cancellation.cancel();
}

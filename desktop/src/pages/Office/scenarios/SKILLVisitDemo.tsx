/**
 * SKILLVisitDemo — SKILL 串门（商务AI→内容AI 工位旁对话气泡交流）
 *
 * Task 10.2: 完整流程：
 *   商务AI 移动到内容AI 工位旁 → 两人对话气泡交流（多轮） → 商务AI 返回工位
 */

import type { DemoController, DemoContext } from '../types';
import { cancelableSleep, createCancellation, demoStep } from './demo-helpers';

/** Demo 资源目标点（与 office-2d-config 中的 WORKSTATION_XS 一致） */
const POS = {
  businessWorkstation: { x: 300, y: 400 },
  contentWorkstation: { x: 440, y: 400 },
};

/** Demo 控制器实例 */
export const skillVisitDemo: DemoController = {
  id: 'skill-visit',
  title: 'SKILL 串门',
  description: '商务AI 走到内容AI 工位旁，通过对话气泡交流业务',
  play,
  stop,
};

const cancellation = createCancellation();

async function play(ctx: DemoContext): Promise<void> {
  cancellation.reset();

  // ===== Step 1: 商务AI 起身（5% → 15%） =====
  await demoStep(ctx, cancellation.isCancelled, 5, '商务AI 准备串门', '商务AI 想到要和内容AI 讨论新项目，准备起身。', 600);
  if (cancellation.isCancelled()) return;

  ctx.setEmployeeStatus('business', 'MOVING');
  ctx.showProgress(15, '商务AI 移动到内容AI 工位旁');
  ctx.showNarration('商务AI 走到内容AI 工位旁，准备发起对话。');

  // 移动到内容AI 工位旁（左侧）
  await ctx.moveEmployee('business', { x: POS.contentWorkstation.x - 50, y: POS.contentWorkstation.y }, 70);
  if (cancellation.isCancelled()) return;

  ctx.setEmployeeStatus('business', 'VISITING');
  await demoStep(ctx, cancellation.isCancelled, 25, '商务AI 到达', '商务AI 到达内容AI 工位旁，准备发起对话。', 500);
  if (cancellation.isCancelled()) return;

  // ===== Step 2: 多轮对话气泡交流（25% → 80%） =====
  // Round 1: 商务AI 提问
  ctx.addBubble('business', 'text', '内容AI，新项目文案能周五前交付吗？', '💬', 2500);
  await demoStep(ctx, cancellation.isCancelled, 35, '对话 Round 1', '商务AI 询问新项目文案交付时间。', 1500);
  if (cancellation.isCancelled()) return;

  // Round 2: 内容AI 回应（思考后回答）
  ctx.setEmployeeStatus('content', 'WORKING');
  ctx.addBubble('content', 'thinking', '正在评估排期...', '💭', 2000);
  await demoStep(ctx, cancellation.isCancelled, 50, '内容AI 思考', '内容AI 正在评估当前排期与工作量。', 1500);
  if (cancellation.isCancelled()) return;

  ctx.addBubble('content', 'text', '可以周五前交付，需提前确认素材', '✅', 2500);
  await demoStep(ctx, cancellation.isCancelled, 65, '内容AI 回应', '内容AI 确认可周五交付，需提前确认素材。', 1500);
  if (cancellation.isCancelled()) return;

  // Round 3: 商务AI 表态 + 情绪
  ctx.addBubble('business', 'emotion', '', '👍', 2000);
  ctx.addBubble('business', 'text', '素材今天下午给你，辛苦了！', '🙂', 2500);
  await demoStep(ctx, cancellation.isCancelled, 80, '对话完成', '商务AI 确认会今天提供素材，对话完成。', 1500);
  if (cancellation.isCancelled()) return;

  // ===== Step 3: 商务AI 返回工位（80% → 100%） =====
  ctx.showProgress(80, '商务AI 返回工位');
  ctx.showNarration('商务AI 结束串门，返回自己的工位继续工作。');
  ctx.setEmployeeStatus('business', 'MOVING');
  ctx.setEmployeeStatus('content', 'WORKING');

  await ctx.moveEmployee('business', POS.businessWorkstation, 70);
  if (cancellation.isCancelled()) return;

  ctx.setEmployeeStatus('business', 'IDLE');
  await demoStep(ctx, cancellation.isCancelled, 100, '完成', 'SKILL 串门结束，双方各自回到工作状态。', 800);
}

function stop(): void {
  cancellation.cancel();
}

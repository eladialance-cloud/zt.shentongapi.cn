/**
 * VoiceMeetingDemo — 语音会议讨论新项目（5 AI 进入会议室 + Push-to-Talk 模拟）
 *
 * Task 10.3: 完整流程：
 *   5 AI 移动进入会议室 → 轮流发言（语音气泡 + 实时字幕） → 达成共识 → 返回工位
 *
 * 不集成真实 WebRTC，仅文字模拟。
 */

import type { DemoController, DemoContext } from '../types';
import { cancelableSleep, createCancellation, demoStep } from './demo-helpers';

/** Demo 资源目标点（与 office-2d-config 中的 RESOURCE_TARGETS.meetingRoom 一致） */
const POS = {
  businessWorkstation: { x: 300, y: 400 },
  contentWorkstation: { x: 440, y: 400 },
  deliveryWorkstation: { x: 580, y: 400 },
  financeWorkstation: { x: 720, y: 400 },
  serviceWorkstation: { x: 860, y: 400 },
  // 会议室座位（围绕圆桌）
  meetingRoom: { x: 140, y: 640 },
  meetingSeat1: { x: 105, y: 605 },
  meetingSeat2: { x: 140, y: 605 },
  meetingSeat3: { x: 175, y: 605 },
  meetingSeat4: { x: 105, y: 678 },
  meetingSeat5: { x: 175, y: 678 },
};

/** Demo 控制器实例 */
export const voiceMeetingDemo: DemoController = {
  id: 'voice-meeting',
  title: '语音会议讨论新项目',
  description: '5 AI 进入会议室 + Push-to-Talk 模拟，讨论新项目立项',
  play,
  stop,
};

const cancellation = createCancellation();

async function play(ctx: DemoContext): Promise<void> {
  cancellation.reset();

  // ===== Step 1: 5 AI 进入会议室（5% → 25%） =====
  await demoStep(ctx, cancellation.isCancelled, 5, '发起会议', '商务AI 发起新项目立项会议，邀请 4 位 AI 员工进入会议室。', 800);
  if (cancellation.isCancelled()) return;

  // 全部切换到 MOVING 状态，并行移动到会议室座位
  ctx.setEmployeeStatus('business', 'MOVING');
  ctx.setEmployeeStatus('content', 'MOVING');
  ctx.setEmployeeStatus('delivery', 'MOVING');
  ctx.setEmployeeStatus('finance', 'MOVING');
  ctx.setEmployeeStatus('service', 'MOVING');

  ctx.showProgress(10, '5 AI 移动到会议室');
  ctx.showNarration('5 AI 员工依次起身前往会议室。');

  // 并行移动（每个 AI 一个座位）
  await Promise.all([
    ctx.moveEmployee('business', POS.meetingSeat1, 70),
    ctx.moveEmployee('content', POS.meetingSeat2, 70),
    ctx.moveEmployee('delivery', POS.meetingSeat3, 70),
    ctx.moveEmployee('finance', POS.meetingSeat4, 70),
    ctx.moveEmployee('service', POS.meetingSeat5, 70),
  ]);
  if (cancellation.isCancelled()) return;

  // 全部进入会议状态
  ctx.setEmployeeStatus('business', 'IN_MEETING');
  ctx.setEmployeeStatus('content', 'IN_MEETING');
  ctx.setEmployeeStatus('delivery', 'IN_MEETING');
  ctx.setEmployeeStatus('finance', 'IN_MEETING');
  ctx.setEmployeeStatus('service', 'IN_MEETING');
  await demoStep(ctx, cancellation.isCancelled, 25, '全员就位', '5 AI 已就位，会议开始。', 800);
  if (cancellation.isCancelled()) return;

  // ===== Step 2: 商务AI 主持（Push-to-Talk 模拟） =====
  // 商务AI 发言（语音气泡 + 实时字幕）
  ctx.addBubble('business', 'voice', '今天讨论新项目立项', '🎤', 3000);
  await demoStep(ctx, cancellation.isCancelled, 35, '商务AI 主持发言', '商务AI 主持会议，宣布讨论新项目立项。', 2500);
  if (cancellation.isCancelled()) return;

  ctx.addBubble('business', 'text', '请各位评估新项目的可行性', '💬', 2500);
  await cancelableSleep(1500, cancellation.isCancelled);
  if (cancellation.isCancelled()) return;

  // ===== Step 3: 各 AI 轮流发言（40% → 80%） =====
  // 内容AI
  ctx.addBubble('content', 'voice', '内容角度：可两周内完成首版', '🎤', 3000);
  await demoStep(ctx, cancellation.isCancelled, 50, '内容AI 发言', '内容AI 评估：可在两周内完成首版内容方案。', 2500);
  if (cancellation.isCancelled()) return;

  // 财务AI
  ctx.addBubble('finance', 'voice', '预算充足，建议优先 ROI', '🎤', 3000);
  await demoStep(ctx, cancellation.isCancelled, 60, '财务AI 发言', '财务AI 评估：预算充足，建议关注 ROI 与回本周期。', 2500);
  if (cancellation.isCancelled()) return;

  // 交付AI
  ctx.addBubble('delivery', 'voice', '交付排期紧，需协调资源', '🎤', 3000);
  await demoStep(ctx, cancellation.isCancelled, 70, '交付AI 发言', '交付AI 提示：交付排期较紧，需提前协调资源。', 2500);
  if (cancellation.isCancelled()) return;

  // 客服AI
  ctx.addBubble('service', 'voice', '客户反馈积极，建议立项', '🎤', 3000);
  await demoStep(ctx, cancellation.isCancelled, 80, '客服AI 发言', '客服AI 反馈：客户需求强烈，建议尽快立项。', 2500);
  if (cancellation.isCancelled()) return;

  // ===== Step 4: 达成共识（80% → 90%） =====
  ctx.addBubble('business', 'emotion', '', '🎯', 2500);
  ctx.addBubble('business', 'text', '共识：新项目立项，下周一启动', '✅', 3000);
  await demoStep(ctx, cancellation.isCancelled, 90, '达成共识', '会议达成共识：新项目立项，下周一正式启动。', 1500);
  if (cancellation.isCancelled()) return;

  // ===== Step 5: 全员返回工位（90% → 100%） =====
  ctx.showProgress(90, '会议结束，全员返回工位');
  ctx.showNarration('会议结束，5 AI 员工依次返回工位继续工作。');

  ctx.setEmployeeStatus('business', 'MOVING');
  ctx.setEmployeeStatus('content', 'MOVING');
  ctx.setEmployeeStatus('delivery', 'MOVING');
  ctx.setEmployeeStatus('finance', 'MOVING');
  ctx.setEmployeeStatus('service', 'MOVING');

  await Promise.all([
    ctx.moveEmployee('business', POS.businessWorkstation, 70),
    ctx.moveEmployee('content', POS.contentWorkstation, 70),
    ctx.moveEmployee('delivery', POS.deliveryWorkstation, 70),
    ctx.moveEmployee('finance', POS.financeWorkstation, 70),
    ctx.moveEmployee('service', POS.serviceWorkstation, 70),
  ]);
  if (cancellation.isCancelled()) return;

  ctx.setEmployeeStatus('business', 'WORKING');
  ctx.setEmployeeStatus('content', 'WORKING');
  ctx.setEmployeeStatus('delivery', 'WORKING');
  ctx.setEmployeeStatus('finance', 'IDLE');
  ctx.setEmployeeStatus('service', 'WORKING');

  await demoStep(ctx, cancellation.isCancelled, 100, '完成', '语音会议结束，会议纪要已自动生成。', 800);
}

function stop(): void {
  cancellation.cancel();
}

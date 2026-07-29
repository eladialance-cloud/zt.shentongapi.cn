/**
 * demo-helpers.ts — Demo 场景共享工具函数
 *
 * Task 10: 为 3 个 Demo 场景提供通用工具（sleep / cancelable sleep / narrate 等）。
 */

/** 简单延时 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cancelable sleep — Demo stop 时立即 resolve */
export function cancelableSleep(ms: number, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (isCancelled() || Date.now() - start >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
}

/** Demo 步骤推进 — 自动更新进度条 + 解说 + 等待 */
export async function demoStep(
  ctx: {
    showProgress: (percent: number, text: string) => void;
    showNarration: (text: string) => void;
  },
  isCancelled: () => boolean,
  percent: number,
  progressText: string,
  narration: string,
  waitMs: number,
): Promise<void> {
  if (isCancelled()) return;
  ctx.showProgress(percent, progressText);
  ctx.showNarration(narration);
  await cancelableSleep(waitMs, isCancelled);
}

/** 创建 cancelable 状态 */
export function createCancellation(): { isCancelled: () => boolean; cancel: () => void; reset: () => void } {
  let cancelled = false;
  return {
    isCancelled: () => cancelled,
    cancel: () => { cancelled = true; },
    reset: () => { cancelled = false; },
  };
}

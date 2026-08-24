/**
 * 口播工坊流水线 —— 纯函数状态机（便于无 DB 单测）
 *
 * 7 步：extract（素材/文案抽取）→ rewrite（LLM 改写）→ voiceClone（声音克隆）
 *      → digitalHuman（数字人合成）→ videoEdit（ffmpeg 合成）→ titleCover（标题+封面）
 *      → publishReady（发布就绪）
 */

/** 步骤顺序（不可随意调整；新增步骤必须同时更新 SQL 与测试） */
export const ORAL_WORKSHOP_STEPS = [
  'extract',
  'rewrite',
  'voiceClone',
  'digitalHuman',
  'videoEdit',
  'titleCover',
  'publishReady',
] as const;

export type OralWorkshopStepName = (typeof ORAL_WORKSHOP_STEPS)[number];

export type OralWorkshopStepStatus = 'pending' | 'running' | 'done' | 'failed';

/** 步骤重试上限（超过则步骤置 failed，任务进入 failed） */
export const MAX_STEP_RETRIES = 2;

/** 步骤的纯状态表示（service 负责与实体互转；id 用于更新已持久化的行） */
export interface PipelineStepState {
  id?: number;
  jobId?: number;
  step: string;
  stepOrder: number;
  status: OralWorkshopStepStatus;
  resultJson?: unknown;
  error?: string;
  retryCount: number;
  startedAt?: Date;
}

/** 初始步骤种子（无 id/result） */
export interface PipelineStepSeed {
  jobId: number;
  step: string;
  stepOrder: number;
  status: OralWorkshopStepStatus;
  retryCount: number;
}

/** 生成初始 7 步（全部 pending） */
export function buildInitialSteps(jobId: number): PipelineStepSeed[] {
  return ORAL_WORKSHOP_STEPS.map((step, i) => ({
    jobId,
    step,
    stepOrder: i + 1,
    status: 'pending' as const,
    retryCount: 0,
  }));
}

/** 当前步骤之后的下一个步骤名；无当前步骤返回第一步；已完成全部返回 null */
export function nextStepName(current?: string | null): OralWorkshopStepName | null {
  if (!current) return ORAL_WORKSHOP_STEPS[0];
  const idx = ORAL_WORKSHOP_STEPS.indexOf(current as OralWorkshopStepName);
  if (idx < 0) return ORAL_WORKSHOP_STEPS[0];
  if (idx >= ORAL_WORKSHOP_STEPS.length - 1) return null;
  return ORAL_WORKSHOP_STEPS[idx + 1];
}

/** 校验步骤名是否合法 */
export function isValidStepName(step: string): step is OralWorkshopStepName {
  return (ORAL_WORKSHOP_STEPS as readonly string[]).includes(step);
}

/**
 * 标记某步为 done（写入产物），返回更新后的步骤数组。
 * 不存在的步骤 / 已 done / 已 failed 的步骤返回原数组（幂等）。
 */
export function markStepDone(
  steps: PipelineStepState[],
  stepName: string,
  resultJson?: unknown,
): PipelineStepState[] {
  return steps.map((s) => {
    if (s.step !== stepName) return s;
    if (s.status === 'done') return s;
    if (s.status === 'failed') return s;
    return { ...s, status: 'done' as const, resultJson: resultJson ?? s.resultJson, error: undefined };
  });
}

/**
 * 标记某步为 failed：未达重试上限 → retry_count+1 并回到 pending（下次可重跑）；
 * 超过上限 → status=failed。返回更新后的步骤数组 + 是否已失败（不可重试）。
 */
export function markStepFailed(
  steps: PipelineStepState[],
  stepName: string,
  error: string,
  maxRetries: number = MAX_STEP_RETRIES,
): { steps: PipelineStepState[]; permanentlyFailed: boolean } {
  let permanentlyFailed = false;
  const updated = steps.map((s) => {
    if (s.step !== stepName) return s;
    if (s.status === 'failed') {
      permanentlyFailed = true;
      return s;
    }
    if (s.retryCount >= maxRetries) {
      permanentlyFailed = true;
      return { ...s, status: 'failed' as const, error, retryCount: Math.min(s.retryCount + 1, maxRetries) };
    }
    return { ...s, status: 'pending' as const, error, retryCount: s.retryCount + 1 };
  });
  return { steps: updated, permanentlyFailed };
}

/** 根据步骤数组推导任务状态：全 done → done；任一 failed → failed；否则 pending/processing */
export function jobStatusAfterSteps(steps: PipelineStepState[]): 'done' | 'failed' | 'pending' | 'processing' {
  if (steps.length === 0) return 'pending';
  if (steps.every((s) => s.status === 'done')) return 'done';
  if (steps.some((s) => s.status === 'failed')) return 'failed';
  if (steps.some((s) => s.status === 'running' || s.status === 'pending')) return 'processing';
  return 'pending';
}

/** 取下一个可执行步骤（第一个 pending），无则 null */
export function nextPendingStep(steps: PipelineStepState[]): PipelineStepState | null {
  return steps.find((s) => s.status === 'pending') ?? null;
}

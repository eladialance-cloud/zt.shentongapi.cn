// 任务中心流水线 —— 纯函数（便于单测）
// 职责：解析 Hermes 拆解 JSON（任务 outputs contentJson.pipeline）→ 动态步骤；
//       老板动作矩阵（选题/终审）；候选选题提取。
// 约定：步骤 JSON 格式 [{ step, agentId?, agentName?, status: 'pending'|'running'|'done' }]
import type { UnifiedTask } from "./unified";

/** 流水线步骤状态：done=完成 active=进行中 waiting=排队 */
/** 流水线步骤状态：done=完成 active=进行中 waiting=排队 review=待确认 rejected=打回超限 */
export type PipelineStepStatus = "done" | "active" | "waiting" | "review" | "rejected";

/** 步骤产出项（对齐 HermesOutput：type=text|image|video|audio|file） */
export interface StepOutputItem {
  type: string;
  url?: string;
  content?: string;
}

/** 确认记录：verdict pass=通过 rework=打回；by=hermes 自评 / user 人工 */
export interface StepReviewInfo {
  verdict: "pass" | "rework";
  reason?: string;
  by?: "hermes" | "user" | string;
  at?: string;
}

/** 动态流水线步骤 */
export interface PipelineStep {
  step: string;
  /** 在 result.steps 中的下标（确认/打回 IPC 用；旧版/合成步骤无下标） */
  index?: number;
  agentId?: number | string;
  agentName?: string;
  /** 执行成员（团队驱动执行）：team_task.result.steps[].assigneeName；缺省表示 Hermes 原生子代理 */
  assigneeName?: string;
  /** 执行角色（团队编排规划产出） */
  agentRole?: string;
  status: PipelineStepStatus;
  /** 原始状态（含 pending_review/rejected），与收敛 status 互补 */
  rawStatus?: string;
  /** 子代理产出（待确认/已完成时展示） */
  outputs?: StepOutputItem[];
  /** Hermes 评审/人工确认记录 */
  review?: StepReviewInfo;
  /** 执行者原始自评（仅展示） */
  selfReview?: StepReviewInfo;
  /** 打回自动重做次数（上限 2） */
  retryCount?: number;
  /** 最近一次打回原因/反馈 */
  lastFeedback?: string;

}

/** 老板动作：select-topic=去选择 approve=通过 reject=打回 */
export interface PipelineAction {
  label?: string;
  kind?: "select-topic" | "approve" | "reject";
}

/** 任务输出项（GET /tasks/:id/outputs 元素，对齐后端 task-output-item 契约） */
export interface TaskOutputItem {
  id: number;
  taskId: number;
  outputType?: string;
  content?: string | null;
  contentJson?: unknown;
  fileUrl?: string | null;
  mimeType?: string | null;
  metadata?: unknown;
  sortOrder?: number;
  createdAt?: string;
}

export type PipelineOutputs = TaskOutputItem[] | null | undefined;

/** 步骤状态映射：done→done running→active pending_review→review rejected→rejected；其余→waiting */
function mapPipelineStatus(s: unknown): PipelineStepStatus {
  if (s === "done") return "done";
  if (s === "running") return "active";
  if (s === "pending_review") return "review";
  if (s === "rejected") return "rejected";
  return "waiting";
}

/** 从 contentJson/metadata 中取拆解步骤数组（对象含 pipeline 字段，或本身即数组） */
function firstPipelineArray(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v && typeof v === "object") {
    const pipeline = (v as Record<string, unknown>).pipeline;
    if (Array.isArray(pipeline)) return pipeline;
  }
  return null;
}

/** 遍历输出项提取第一个合法的 Hermes 拆解步骤数组；非法/缺失返回 null */
function extractPipelineArray(outputs: PipelineOutputs): unknown[] | null {
  if (!Array.isArray(outputs)) return null;
  for (const item of outputs) {
    if (!item || typeof item !== "object") continue;
    const contentJson = (item as TaskOutputItem).contentJson;
    const metadata = (item as TaskOutputItem).metadata;
    const found = firstPipelineArray(contentJson) ?? firstPipelineArray(metadata);
    // 空数组视为无效（避免 pipeline: [] 短路跳过后续合法输出项）
    if (found && found.length > 0) return found;
  }
  return null;
}

/** 规整单条步骤：step 缺失/空跳过；status 缺失默认 waiting；agentName/agentId 可选 */
function normalizeStep(raw: unknown): PipelineStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const step = typeof r.step === "string" ? r.step.trim() : "";
  if (!step) return null;
  const agentName =
    typeof r.agentName === "string" && r.agentName.trim() ? r.agentName : undefined;
  const agentId =
    typeof r.agentId === "number" || typeof r.agentId === "string"
      ? (r.agentId as number | string)
      : undefined;
  return {
    step,
    ...(agentId !== undefined ? { agentId } : {}),
    ...(agentName !== undefined ? { agentName } : {}),
    status: mapPipelineStatus(r.status),
  };
}

/** 无拆解 JSON 时按任务统一状态推导单步（页面不白屏） */
function deriveSingleStep(task: UnifiedTask): PipelineStep {
  switch (task.status) {
    case "done":
      return { step: "已完成", status: "done" };
    case "running":
      return { step: "执行中", status: "active" };
    case "failed":
      return { step: "执行失败", status: "done" };
    case "cancelled":
      return { step: "已取消", status: "done" };
    case "todo":
    default:
      return { step: "待执行", status: "waiting" };
  }
}

/** 规整子代理产出（HermesOutput 数组）；非法/空 → [] */
function parseStepOutputs(raw: unknown): StepOutputItem[] {
  if (!Array.isArray(raw)) return [];
  const out: StepOutputItem[] = [];
  for (const o of raw) {
    if (!o || typeof o !== "object") continue;
    const t = o as Record<string, unknown>;
    const type = typeof t.type === "string" ? t.type : "text";
    const url = typeof t.url === "string" ? t.url : undefined;
    const content = typeof t.content === "string" ? t.content : undefined;
    if (!url && !content) continue;
    out.push({ type, ...(url ? { url } : {}), ...(content ? { content } : {}) });
  }
  return out;
}

/** 规整确认/自评记录；非法 → undefined */
function parseStepReview(raw: unknown): StepReviewInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.verdict !== "pass" && r.verdict !== "rework") return undefined;
  const reason = typeof r.reason === "string" ? r.reason : undefined;
  const by = typeof r.by === "string" ? r.by : undefined;
  const at = typeof r.at === "string" ? r.at : undefined;
  return { verdict: r.verdict, ...(reason ? { reason } : {}), ...(by ? { by } : {}), ...(at ? { at } : {}) };
}

/**
 * Hermes 编排步骤（team_task.result.steps，团队驱动执行）→ 流水线步骤。
 * 契约对齐 desktop/electron/main/hermes-result.ts 的 HermesStep：
 *   { name, status: done|running|pending, rawStatus?: pending_review|rejected, assigneeName?, outputs?, review?, selfReview?, retryCount?, lastFeedback? }
 * 无 steps / 非法 → []（调用方回退按状态推导单步）。
 */
export function parseTeamSteps(result: unknown): PipelineStep[] {
  if (!result || typeof result !== "object") return [];
  const steps = (result as Record<string, unknown>).steps;
  if (!Array.isArray(steps)) return [];
  const out: PipelineStep[] = [];
  steps.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") return;
    const r = raw as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) return;
    const rawStatus = typeof r.rawStatus === "string" && r.rawStatus ? r.rawStatus : undefined;
    const assigneeName = typeof r.assigneeName === "string" ? r.assigneeName : undefined;
    const agentRole = typeof r.agentRole === "string" ? r.agentRole : undefined;
    const step: PipelineStep = {
      step: name,
      index,
      status: mapPipelineStatus(rawStatus ?? r.status),
      ...(assigneeName ? { assigneeName } : {}),
      ...(agentRole ? { agentRole } : {}),
    };
    if (rawStatus) step.rawStatus = rawStatus;
    const outputs = parseStepOutputs(r.outputs);
    if (outputs.length > 0) step.outputs = outputs;
    const review = parseStepReview(r.review);
    if (review) step.review = review;
    const selfReview = parseStepReview(r.selfReview);
    if (selfReview) step.selfReview = selfReview;
    if (typeof r.retryCount === "number" && r.retryCount > 0) step.retryCount = r.retryCount;
    const lastFeedback = typeof r.lastFeedback === "string" ? r.lastFeedback : undefined;
    if (lastFeedback) step.lastFeedback = lastFeedback;

    out.push(step);
  });
  return out;
}

/**
 * 解析任务流水线：优先读 outputs 中 Hermes 拆解 JSON（contentJson.pipeline，
 * 兼容 contentJson/metadata 直接为数组或含 pipeline 字段）；无合法 JSON 时
 * 按任务状态推导单步。
 */
export function parsePipeline(
  task: UnifiedTask,
  outputs: PipelineOutputs = null
): PipelineStep[] {
  const rawArray = extractPipelineArray(outputs);
  if (rawArray && rawArray.length > 0) {
    const steps: PipelineStep[] = [];
    for (const raw of rawArray) {
      const step = normalizeStep(raw);
      if (step) steps.push(step);
    }
    if (steps.length > 0) return steps;
  }
  return [deriveSingleStep(task)];
}

/**
 * 老板动作矩阵：仅 active 步可操作——步骤名含「选题」→ 去选择；
 * 含「终审/审核/初审」→ 通过/打回；其余返回 null。
 * task 参数保留供后续按来源/团队维度扩展动作可见性。
 */
export function pipelineActions(
  task: UnifiedTask,
  step: PipelineStep
): PipelineAction | null {
  if (step.status !== "active") return null;
  if (step.step.includes("选题")) {
    return { label: "去选择", kind: "select-topic" };
  }
  if (/终审|审核|初审/.test(step.step)) {
    return { label: "通过/打回", kind: "approve" };
  }
  return null;
}

/** 任务级快速操作：团队待办任务 → 开始执行；失败任务 → 重试（任务中心可直接推进状态） */
export interface TaskQuickAction {
  kind: "start" | "retry";
  label: string;
  /** 目标团队任务状态：start → in_progress；retry → pending */
  status: "in_progress" | "pending";
  successText: string;
  description: string;
}

/** 仅团队来源任务可快速推进；非团队来源或非待办/失败状态返回 null */
export function taskQuickAction(task: UnifiedTask): TaskQuickAction | null {
  if (task.source !== "team") return null;
  if (task.status === "todo") {
    return {
      kind: "start",
      label: "开始任务",
      status: "in_progress",
      successText: "任务已开始执行",
      description: "[老板] 开始执行任务",
    };
  }
  if (task.status === "failed") {
    return {
      kind: "retry",
      label: "重试",
      status: "pending",
      successText: "任务已重新排队",
      description: "[老板] 重试任务",
    };
  }
  return null;
}

/**
 * 候选选题：contentJson.candidates（字符串或 {name/title} 对象）与 content 文本行；
 * 去重、去空；无候选返回空数组（前端允许手输）。
 */
export function topicCandidates(outputs: PipelineOutputs): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (v: string) => {
    const trimmed = v.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  };
  if (!Array.isArray(outputs)) return result;
  for (const item of outputs) {
    if (!item || typeof item !== "object") continue;
    const contentJson = (item as TaskOutputItem).contentJson;
    const metadata = (item as TaskOutputItem).metadata;
    for (const source of [contentJson, metadata]) {
      if (!source || typeof source !== "object") continue;
      const candidates = (source as Record<string, unknown>).candidates;
      if (!Array.isArray(candidates)) continue;
      for (const c of candidates) {
        if (typeof c === "string") {
          push(c);
        } else if (c && typeof c === "object") {
          const o = c as Record<string, unknown>;
          if (typeof o.name === "string") push(o.name);
          else if (typeof o.title === "string") push(o.title);
        }
      }
    }
    const content = (item as TaskOutputItem).content;
    if (typeof content === "string") {
      for (const line of content.split(/\r?\n/)) push(line);
    }
  }
  return result;
}

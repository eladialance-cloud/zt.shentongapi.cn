// 任务中心流水线 —— 纯函数（便于单测）
// 职责：解析 Hermes 拆解 JSON（任务 outputs contentJson.pipeline）→ 动态步骤；
//       老板动作矩阵（选题/终审）；候选选题提取。
// 约定：步骤 JSON 格式 [{ step, agentId?, agentName?, status: 'pending'|'running'|'done' }]
import type { UnifiedTask } from "./unified";

/** 流水线步骤状态：done=完成 active=进行中 waiting=排队 */
export type PipelineStepStatus = "done" | "active" | "waiting";

/** 动态流水线步骤 */
export interface PipelineStep {
  step: string;
  agentId?: number | string;
  agentName?: string;
  status: PipelineStepStatus;
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

/** 步骤状态映射：pending→waiting running→active done→done；缺失/未知→waiting */
function mapPipelineStatus(s: unknown): PipelineStepStatus {
  if (s === "done") return "done";
  if (s === "running") return "active";
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

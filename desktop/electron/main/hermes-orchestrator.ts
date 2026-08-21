/** Hermes 编排桥：team_task 状态机 + 团队指派（成员人设注入，无团队降级子代理）+ CLI 调用 + 结果回写（主进程） */
import { spawn } from "node:child_process";
import { parseHermesResult, type OrchestrateResult } from "./hermes-result";

export type TeamTaskStatus = "pending" | "in_progress" | "completed" | "failed";

/** 幂等：仅 pending 可提交编排；in_progress 防并发双跑；终态不可重复提交 */
export function assertSubmittable(status: TeamTaskStatus): boolean {
  return status === "pending";
}

/** 团队成员（独立 Agent）：agents 表人设 + team_members 角色；空数组 = 降级 Hermes 原生子代理 */
export interface TeamMemberProfile {
  memberId: number;
  agentId: number;
  roleTitle: string;
  roleDescription?: string;
  systemPrompt?: string;
  modelId?: string;
  knowledgeBaseIds?: number[];
}

export interface OrchestrateInput {
  executionRef: string;
  teamTaskId: number;
  teamId: number;
  briefId?: number;
  task: string;
  teamMembers?: TeamMemberProfile[];
  context?: Record<string, unknown>;
  /** 设置页每类默认模型（方案 B）：Hermes 按子任务类型自行调度模型 */
  modelDefaults?: {
    chat?: string;
    vision?: string;
    image?: string;
    video?: string;
    tts?: string;
  };
  timeoutMs?: number;
}

export interface OrchestrateDeps {
  patchTask: (
    teamId: number,
    taskId: number,
    payload: { status: TeamTaskStatus; result?: unknown },
  ) => Promise<void>;
  reportExecution: (input: OrchestrateInput, result: OrchestrateResult) => Promise<void>;
  persistOutputs: (taskId: number, result: OrchestrateResult) => Promise<void>;
  spawnCli: (prompt: string, opts?: { model?: string }) => {
    child: ReturnType<typeof spawn>;
    stdout: () => Promise<string>;
    stderr: () => Promise<string>;
  };
  now: () => number;
}

/** 把团队成员花名册注入任务描述；无成员则原样返回（触发 Hermes 子代理降级） */
export function buildTaskPrompt(
  task: string,
  teamMembers?: TeamMemberProfile[] | null,
  modelDefaults?: { chat?: string; vision?: string; image?: string; video?: string; tts?: string } | null,
): string {
  const hasMembers = !!teamMembers && teamMembers.length > 0
  const md = modelDefaults ?? null
  const hasModels = !!md && (md.chat || md.vision || md.image || md.video || md.tts)
  if (!hasMembers && !hasModels) return task
  const parts: string[] = []
  if (hasMembers) {
    const roster = teamMembers!
      .map((m) => {
        const desc = m.roleDescription ? `（${m.roleDescription}）` : ""
        const persona = m.systemPrompt ? `：${m.systemPrompt}` : ""
        return `- ${m.roleTitle}${desc}${persona}`
      })
      .join("\n")
    parts.push(`可用团队成员清单：\n${roster}`)
  }
  if (hasModels) {
    const route: string[] = ["【媒体模型路由表】"]
    if (md!.chat) route.push(`- 文案/推理/问答：直接 LLM（默认模型：${md!.chat}）`)
    if (md!.vision) route.push(`- 图片识图：直接 LLM（识图模型：${md!.vision}）`)
    if (md!.image) route.push(`- 图片生成：调用 st-claw-controller --action t2i/i2i --model ${md!.image}`)
    if (md!.video) route.push(`- 视频生成：调用 st-claw-controller --action video --model ${md!.video}`)
    if (md!.tts) route.push(`- 语音合成：使用平台 tts 通道（模型：${md!.tts}）`)
    parts.push(route.join("\n"))
  }
  parts.push(`任务：${task}`)
  return parts.join("\n\n")
}

export async function orchestrate(
  input: OrchestrateInput,
  deps: OrchestrateDeps,
): Promise<OrchestrateResult> {
  const timeoutMs = input.timeoutMs ?? 5 * 60 * 1000;
  const start = deps.now();
  await deps.patchTask(input.teamId, input.teamTaskId, { status: "in_progress" });
  let result: OrchestrateResult;
  try {
    const prompt = buildTaskPrompt(input.task, input.teamMembers, input.modelDefaults ?? null);
    const { child, stdout } = deps.spawnCli(
      prompt,
      input.modelDefaults?.chat ? { model: input.modelDefaults.chat } : undefined,
    );
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    const out = await stdout();
    clearTimeout(timeout);
    result = parseHermesResult(out, deps.now() - start);
  } catch (err) {
    result = {
      status: "failed",
      summary: "Hermes 执行失败",
      steps: [],
      outputs: [],
      error: (err as Error).message,
      durationMs: deps.now() - start,
    };
  }
  const finalStatus: TeamTaskStatus = result.status === "failed" ? "failed" : "completed";
  await deps.patchTask(input.teamId, input.teamTaskId, {
    status: finalStatus,
    result: { executionRef: input.executionRef, ...result },
  });
  await deps.reportExecution(input, result);
  await deps.persistOutputs(input.teamTaskId, result);
  return result;
}
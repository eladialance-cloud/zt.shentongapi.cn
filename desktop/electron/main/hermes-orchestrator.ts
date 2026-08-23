/** Hermes 编排桥：team_task 状态机 + 团队指派（成员人设注入，无团队降级子代理）+ CLI 调用 + 结果回写（主进程） */
import { spawn } from "node:child_process";
import { parseHermesResult, parseStepResult, type HermesOutput, type HermesStep, type OrchestrateResult, type StepRunResult } from "./hermes-result";

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

/** 团队协作流程节点（来自团队配置；Hermes 规划时作为任务主干模板） */
export interface WorkflowNode {
  id?: number;
  name: string;
  description?: string;
  order: number;
  assigneeIds?: number[];
}

export interface OrchestrateInput {
  executionRef: string;
  teamTaskId: number;
  teamId: number;
  briefId?: number;
  task: string;
  teamMembers?: TeamMemberProfile[];
  /** 团队已配置的协作流程（可选；Hermes 规划时作为主干，未配置则动态拆解） */
  workflow?: WorkflowNode[];
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
// ================= 逐步执行器（P2：子代理节点逐个执行 + 人工/自评确认 + 打回重做） =================

/** 单节点（子代理）状态：pending 排队 / running 执行中 / pending_review 待确认 / done 通过 / rejected 打回超限 */
export type RunnerStepStatus = "pending" | "running" | "pending_review" | "done" | "rejected";

export interface RunnerStep {
  name: string;
  agentRole?: string;
  status: RunnerStepStatus;
  assigneeName?: string;
  outputs?: HermesOutput[];
  review?: { verdict: "pass" | "rework"; reason?: string; by: "hermes" | "user"; at?: string };
  retryCount: number;
  lastFeedback?: string;
}

export interface StepRunnerDeps {
  /** 执行规划/单步：给定 prompt 返回 Hermes CLI stdout（已含超时与错误归一） */
  runPrompt: (prompt: string, opts?: { model?: string }) => Promise<{ stdout: string; error?: string }>;
  /** 回写任务状态与 steps（result 覆盖写） */
  patchTask: (teamId: number, taskId: number, payload: { status: string; result?: unknown }) => Promise<void>;
  reportExecution: (payload: Record<string, unknown>) => Promise<void>;
  persistOutputs: (taskId: number, outputs: HermesOutput[]) => Promise<void>;
  /** 自动确认开关（调用时实时读取，便于中途切换） */
  isAutoConfirm: () => boolean;
  /** 按节点检索知识库（SOP/标准），返回可直接注入 prompt 的文本；返回空串 = 无参考 */
  retrieveKnowledge?: (query: string) => Promise<string>;
  /** 立即中断当前 Hermes CLI（stop 时杀掉正在跑的进程） */
  abortCurrent?: () => void;
  now: () => number;
  /** 单节点打回重做上限，默认 2 */
  maxRetries?: number;
}

/** 规划 prompt：Hermes 把任务拆成有序节点清单（输出单行 JSON） */
export function buildPlanPrompt(
  task: string,
  teamMembers?: TeamMemberProfile[] | null,
  modelDefaults?: OrchestrateInput["modelDefaults"] | null,
  workflow?: WorkflowNode[] | null,
): string {
  const base = buildTaskPrompt(task, teamMembers, modelDefaults ?? null);
  const parts: string[] = [base];
  const wf = Array.isArray(workflow) && workflow.length > 0 ? workflow : null;
  if (wf) {
    const nodes = wf
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((n, i) => {
        const desc = n.description ? "（" + n.description + "）" : "";
        return (i + 1) + ". " + n.name + desc;
      })
      .join("\n");
    parts.push(
      "团队已配置协作流程（必须按以下顺序作为任务主干，不得跳步、不得改变顺序，可在每个节点内细化）：\n" + nodes,
    );
  }
  const countHint = wf ? "有序执行节点" : "2~5 个有序执行节点";
  parts.push(
    "请把上述任务按" + (wf ? "该协作流程" : "业务依赖") + "拆解为 " + countHint + "（每个节点由一个子代理完成，节点之间按依赖排序）。",
    "严格输出单行 JSON，不要输出任何其他文字：{\"steps\":[{\"name\":\"节点名\",\"agentRole\":\"可选角色\"}]}",
  );
  return parts.join("\n\n");
}
/** 单步执行 prompt：任务背景 + 前序产出 + 本步指令 + 输出格式约束 */
export function buildStepPrompt(input: {
  task: string;
  teamMembers?: TeamMemberProfile[] | null;
  modelDefaults?: OrchestrateInput["modelDefaults"] | null;
  stepName: string;
  previousSummary?: string;
  feedback?: string;
  /** 知识库检索结果（SOP/标准），注入为参考约束 */
  knowledge?: string;
}): string {
  const base = buildTaskPrompt(input.task, input.teamMembers ?? null, input.modelDefaults ?? null);
  const parts = [base];
  if (input.previousSummary) {
    parts.push("已完成的前序节点与产出：" + input.previousSummary);
  }
  parts.push("当前要执行节点：" + input.stepName);
  if (input.knowledge) {
    parts.push("参考知识库内容（SOP/标准，必须遵守；与任务描述冲突时以知识库为准）：\n" + input.knowledge);
  }
  if (input.feedback) {
    parts.push("该节点上一次被打回，原因：" + input.feedback + "。请针对该原因修正后再输出，不要重复犯错。");
  }
  parts.push(
    "完成该节点后严格输出单行 JSON，不要输出其他文字：",
    '{"summary":"完成说明","outputs":[{"type":"text|image|video|audio|file","content":"文本内容","url":"文件URL"}],"review":{"verdict":"pass|rework","reason":"自评说明"}}',
    "review.verdict：产出达标用 pass；未达标用 rework 并写明原因。outputs 至少给出产出内容。"
  );
  return parts.join("\n\n");
}

/** 解析规划 stdout → 节点清单；非法/空 → []（调用方按失败处理） */
export function parsePlan(stdout: string): Array<{ name: string; agentRole?: string }> {
  const text = (stdout || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1].trim() : text.match(/\{[\s\S]*\}/)?.[0] ?? "";
  try {
    const data = JSON.parse(jsonText) as { steps?: unknown };
    if (!data || !Array.isArray(data.steps)) return [];
    const out: Array<{ name: string; agentRole?: string }> = [];
    for (const raw of data.steps) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      out.push({ name, ...(typeof r.agentRole === "string" && r.agentRole.trim() ? { agentRole: r.agentRole.trim() } : {}) });
    }
    return out;
  } catch {
    return [];
  }
}

export interface StepResult extends HermesStep {
  agentRole?: string;
  review?: RunnerStep["review"];
  retryCount?: number;
  lastFeedback?: string;
  /** 保留原始状态（含 pending_review/rejected），供前端精确渲染 */
  rawStatus: RunnerStepStatus;
}

export interface StepRunnerHandle {
  taskKey: string;
  /** 人工确认某节点通过（仅 pending_review 生效） */
  confirmStep(stepIndex: number): void;
  /** 人工打回某节点（必填原因）→ Hermes 消化原因自动重做 */
  rejectStep(stepIndex: number, reason: string): void;
  cancel(): void;
  /** 暂停：当前节点跑完后挂起 */
  pause(): void;
  /** 继续执行 */
  resume(): void;
  /** 立即中断：取消 + 杀掉当前 CLI，任务标记失败 */
  stop(): void;
  wait(): Promise<OrchestrateResult>;
}

/**
 * 创建逐步执行 runner：
 * 1. 规划节点清单 → 回写 in_progress + steps(全 pending)
 * 2. 逐节点执行（重做上限 maxRetries）：完成 → 产出 + 自评回写
 *    人工模式：节点进入 pending_review 等待 confirm/reject；
 *    自动模式：按自评 verdict pass→下一步 / rework→自动重做
 * 3. 全部通过 → completed；节点 rejected → failed；结果回写 result/report/outputs
 */
export function createStepRunner(input: OrchestrateInput, deps: StepRunnerDeps): StepRunnerHandle {
  const maxRetries = Math.max(0, deps.maxRetries ?? 2);
  const taskKey = `team:${input.teamTaskId}`;
  let cancelled = false;
  let paused = false;
  let pauseWaiters: Array<() => void> = [];
  let finished = false;
  const steps: RunnerStep[] = [];
  const finalOutputs: HermesOutput[] = [];
  const decisionWaiters = new Map<number, (d: { verdict: "pass" } | { verdict: "rework"; reason: string }) => void>();
  const resultPromise = run();

  function setPaused(v: boolean) {
    paused = v;
    if (!v) { const ws = pauseWaiters; pauseWaiters = []; for (const w of ws) w(); }
  }
  async function pausePoint() {
    while (paused) {
      await new Promise<void>((resolve) => pauseWaiters.push(resolve));
    }
  }

  async function run(): Promise<OrchestrateResult> {
    const start = deps.now();
    const fail = (summary: string, error: string): OrchestrateResult => ({
      status: "failed", summary, steps: steps.map(toResultStep), outputs: finalOutputs, error, durationMs: deps.now() - start,
    });
    /** 失败统一出口：先 PATCH failed（含 steps 明细），再返回失败结果 */
    const failTask = async (summary: string, error: string): Promise<OrchestrateResult> => {
      const failed = fail(summary, error);
      console.error("[hermes-orchestrator] failTask:", summary, "|", error);
      await deps.patchTask(input.teamId, input.teamTaskId, {
        status: "failed",
        result: { executionRef: input.executionRef, ...failed },
      });
      return failed;
    };
    try {
      await pausePoint();
      // 1) 规划
      await deps.patchTask(input.teamId, input.teamTaskId, { status: "in_progress" });
      const planResp = await deps.runPrompt(
        buildPlanPrompt(input.task, input.teamMembers ?? null, input.modelDefaults ?? null, input.workflow ?? null),
        input.modelDefaults?.chat ? { model: input.modelDefaults.chat } : undefined,
      );
      if (planResp.error) return await failTask("任务规划失败", planResp.error);
      const plan = parsePlan(planResp.stdout);
      if (plan.length === 0) return await failTask("任务规划失败", "Hermes 未输出有效节点清单");
      for (const p of plan) steps.push({ name: p.name, agentRole: p.agentRole, status: "pending", retryCount: 0 });
      await deps.patchTask(input.teamId, input.teamTaskId, {
        status: "in_progress",
        result: { executionRef: input.executionRef, status: "running", steps: steps.map(toResultStep), outputs: [] },
      });

      // 2) 逐节点执行
      const previousSummary: string[] = [];
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        let decided = false;
        while (!decided) {
          if (cancelled) return await failTask("任务已取消", "用户取消");
          await pausePoint();
          step.status = "running";
          await sync();
          const knowledge = deps.retrieveKnowledge
            ? await deps.retrieveKnowledge(step.name).catch(() => "")
            : "";
          const execResp = await deps.runPrompt(
            buildStepPrompt({
              task: input.task,
              teamMembers: input.teamMembers ?? null,
              modelDefaults: input.modelDefaults ?? null,
              stepName: step.name,
              previousSummary: previousSummary.join("\n"),
              feedback: step.lastFeedback,
              knowledge,
            }),
            input.modelDefaults?.chat ? { model: input.modelDefaults.chat } : undefined,
          );
          if (execResp.error) {
            step.status = "rejected";
            step.review = { verdict: "rework", reason: execResp.error, by: "hermes" as const, at: iso() };
            break;
          }
          const res: StepRunResult = parseStepResult(execResp.stdout);
          step.outputs = res.outputs ?? [];
          const autoVerdict: "pass" | "rework" = res.review?.verdict ?? (step.outputs.length > 0 ? "pass" : "rework");
          const autoReason = res.review?.reason;
          step.review = { verdict: autoVerdict, ...(autoReason ? { reason: autoReason } : {}), by: "hermes" as const, at: iso() };

          if (deps.isAutoConfirm()) {
            if (autoVerdict === "pass") {
              step.status = "done";
              decided = true;
            } else {
              step.retryCount += 1;
              step.lastFeedback = autoReason || "产出未达标";
              if (step.retryCount > maxRetries) {
                step.status = "rejected";
                decided = true;
              }
              // 否则自动重做：循环回到 running
            }
          } else {
            // 人工模式：进入待确认
            step.status = "pending_review";
            await sync();
            const decision = await waitDecision(i);
            if (decision.verdict === "pass") {
              step.status = "done";
              step.review = { verdict: "pass" as const, by: "user" as const, at: iso() };
              decided = true;
            } else {
              step.retryCount += 1;
              step.lastFeedback = decision.reason;
              if (step.retryCount > maxRetries) {
                step.status = "rejected";
                step.review = { verdict: "rework" as const, reason: decision.reason, by: "user" as const, at: iso() };
                decided = true;
              }
              // 否则带原因自动重做
            }
          }
        }
        if (step.status === "rejected") {
          await sync();
          return await failTask("节点执行失败：" + step.name, step.review?.reason ?? "打回超限");
        }
        if (step.outputs && step.outputs.length > 0) {
          finalOutputs.push(...step.outputs);
          previousSummary.push(step.name + "：" + (step.outputs.map((o) => o.content ?? o.url ?? "").join("；") || "完成"));
        } else {
          previousSummary.push(step.name + "：完成");
        }
      }
      const result: OrchestrateResult = {
        status: "completed",
        summary: "任务完成（" + steps.filter((s) => s.status === "done").length + "/" + steps.length + " 节点通过）",
        steps: steps.map(toResultStep),
        outputs: finalOutputs,
        error: null,
        durationMs: deps.now() - start,
      };
      await deps.patchTask(input.teamId, input.teamTaskId, {
        status: "completed",
        result: { executionRef: input.executionRef, ...result },
      });
      await deps.reportExecution({
        executionRef: input.executionRef, teamTaskId: input.teamTaskId, teamId: input.teamId,
        status: result.status, summary: result.summary, steps: result.steps, outputs: result.outputs,
        error: result.error, durationMs: result.durationMs,
      });
      await deps.persistOutputs(input.teamTaskId, finalOutputs);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[hermes-orchestrator] orchestrate exception:", err);
      const failed = fail("任务执行异常", message);
      await deps.patchTask(input.teamId, input.teamTaskId, { status: "failed", result: { executionRef: input.executionRef, ...failed } });
      return failed;
    } finally {
      finished = true;
    }
  }

  function toResultStep(s: RunnerStep): StepResult {
    return {
      name: s.name,
      status: s.status === "done" ? "done" : s.status === "running" ? "running" : "pending",
      ...(s.agentRole ? { agentRole: s.agentRole } : {}),
      ...(s.assigneeName ? { assigneeName: s.assigneeName } : {}),
      ...(s.outputs && s.outputs.length > 0 ? { outputs: s.outputs } : {}),
      ...(s.review ? { review: s.review } : {}),
      ...(s.retryCount > 0 ? { retryCount: s.retryCount } : {}),
      ...(s.lastFeedback ? { lastFeedback: s.lastFeedback } : {}),
      rawStatus: s.status, // 保留原始状态（含 pending_review/rejected），供前端精确渲染
    };
  }

  function sync() {
    return deps.patchTask(input.teamId, input.teamTaskId, {
      status: "in_progress",
      result: { executionRef: input.executionRef, status: "running", steps: steps.map(toResultStep), outputs: finalOutputs },
    });
  }

  function iso(): string {
    return new Date(deps.now()).toISOString();
  }

  function waitDecision(stepIndex: number): Promise<{ verdict: "pass" } | { verdict: "rework"; reason: string }> {
    return new Promise((resolve) => {
      decisionWaiters.set(stepIndex, resolve);
    });
  }

  return {
    taskKey,
    confirmStep(stepIndex) {
      const resolve = decisionWaiters.get(stepIndex);
      if (resolve) { decisionWaiters.delete(stepIndex); resolve({ verdict: "pass" }); }
    },
    rejectStep(stepIndex, reason) {
      const resolve = decisionWaiters.get(stepIndex);
      if (resolve) { decisionWaiters.delete(stepIndex); resolve({ verdict: "rework", reason }); }
    },
    cancel() { cancelled = true; },
    pause() { setPaused(true); },
    resume() { setPaused(false); },
    stop() { setPaused(false); cancelled = true; deps.abortCurrent?.(); },
    wait: () => resultPromise,
  };
}

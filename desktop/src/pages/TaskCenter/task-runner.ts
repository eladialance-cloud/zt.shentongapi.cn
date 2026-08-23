// 任务中心逐步编排 —— 渲染层桥（纯函数可单测 + IPC 副作用封装）
// 职责：从统一任务构造 runner 入参；自动开始决策；确认/打回/自评开关 IPC 调用
import type { UnifiedTask } from "./unified";

/** 从统一任务 key（如 "team:12"）解析原生团队任务 ID；非 team 或非法返回 null */
export function nativeTaskId(key: string): number | null {
  const idx = key.indexOf(":");
  if (idx < 0) return null;
  const id = Number(key.slice(idx + 1));
  return Number.isFinite(id) ? id : null;
}

/** 团队任务判定（runner 仅对团队任务生效） */
export function isTeamTask(task: UnifiedTask): boolean {
  return task.source === "team";
}

/** 从团队任务 result 中取执行引用（重试沿用同一引用，便于 call_log 串联）；teamId 可空（auto/agent 模式） */
export function executionRefOf(task: UnifiedTask, teamId?: number): string {
  const result = task.result as Record<string, unknown> | null | undefined;
  if (result && typeof result.executionRef === "string" && result.executionRef) {
    return result.executionRef;
  }
  if (task.briefId) return "brief-" + task.briefId;
  const taskId = nativeTaskId(task.key);
  return `team-${teamId}-${taskId ?? "x"}-${Date.now()}`;
}

/** 任务描述（Hermes 拆解输入）：标题 + 备注合并，去除 [老板] 等控制前缀残留 */
export function taskPromptOf(task: UnifiedTask): string {
  return task.title?.trim() || "执行任务";
}

/** 自动开始决策：团队待办 + 开关开启 + 并发未超限 */
export function shouldAutoStart(
  task: UnifiedTask,
  opts: { autoStartOn: boolean; runningCount: number; maxConcurrent?: number },
): boolean {
  if (!opts.autoStartOn) return false;
  if (!isTeamTask(task)) return false;
  if (task.status !== "todo") return false;
  const max = opts.maxConcurrent ?? 2;
  return opts.runningCount < max;
}

/** 提交逐步编排（后台执行，立即返回）；未装 Hermes 或参数缺失时返回错误文案 */
export async function submitStepRunner(payload: {
  token: string;
  /** 执行团队 ID；auto/agent 模式可空 */
  teamId?: number;
  taskId: number;
  task: UnifiedTask;
  autoConfirm?: boolean;
}): Promise<{ ok: boolean; started?: boolean; error?: string }> {
  const api = window.electronAPI?.hermesOrchestrate;
  if (!api) return { ok: false, error: "当前版本不支持逐步编排（请升级客户端）" };
  if (!payload.token) return { ok: false, error: "未登录" };
  try {
    const input = {
      executionRef: executionRefOf(payload.task, payload.teamId),
      teamTaskId: payload.taskId,
      ...(payload.teamId != null ? { teamId: payload.teamId } : {}),
      ...(payload.task.executeMode ? { executeMode: payload.task.executeMode } : {}),
      ...(payload.task.agentId != null ? { agentId: payload.task.agentId } : {}),
      ...(payload.task.briefId ? { briefId: payload.task.briefId } : {}),
      task: taskPromptOf(payload.task),
    };
    return await api.submit({ token: payload.token, input, autoConfirm: !!payload.autoConfirm });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 人工通过某节点（仅 pending_review 生效） */
export async function confirmStep(
  token: string,
  teamTaskId: number,
  stepIndex: number,
): Promise<{ ok: boolean; error?: string }> {
  const api = window.electronAPI?.hermesOrchestrate;
  if (!api) return { ok: false, error: "当前版本不支持逐步编排（请升级客户端）" };
  return api.confirmStep({ token, teamTaskId, stepIndex });
}

/** 人工打回（原因必填）→ Hermes 消化原因自动重做该节点 */
export async function rejectStep(
  token: string,
  teamTaskId: number,
  stepIndex: number,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const api = window.electronAPI?.hermesOrchestrate;
  if (!api) return { ok: false, error: "当前版本不支持逐步编排（请升级客户端）" };
  if (!reason?.trim()) return { ok: false, error: "打回必须填写原因" };
  return api.rejectStep({ token, teamTaskId, stepIndex, reason: reason.trim() });
}

/** 运行中切换自动确认（自评）开关 */
export async function setAutoConfirm(
  token: string,
  teamTaskId: number,
  autoConfirm: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const api = window.electronAPI?.hermesOrchestrate;
  if (!api) return { ok: false, error: "当前版本不支持逐步编排（请升级客户端）" };
  return api.setAutoConfirm({ token, teamTaskId, autoConfirm });
}

/** 运行中的团队任务数量（自动开始并发控制） */
export function countRunning(tasks: UnifiedTask[]): number {
  return tasks.filter((t) => isTeamTask(t) && t.status === "running").length;
}

/** 暂停：当前节点跑完后挂起 */
export async function pauseTask(teamTaskId: number): Promise<{ ok: boolean; error?: string }> {
  const api = window.electronAPI?.hermesOrchestrate;
  if (!api) return { ok: false, error: "当前版本不支持逐步编排（请升级客户端）" };
  return api.pause({ teamTaskId });
}

/** 继续执行 */
export async function resumeTask(teamTaskId: number): Promise<{ ok: boolean; error?: string }> {
  const api = window.electronAPI?.hermesOrchestrate;
  if (!api) return { ok: false, error: "当前版本不支持逐步编排（请升级客户端）" };
  return api.resume({ teamTaskId });
}

/** 立即中断：杀掉当前 Hermes CLI，任务标记失败 */
export async function stopTask(teamTaskId: number): Promise<{ ok: boolean; error?: string }> {
  const api = window.electronAPI?.hermesOrchestrate;
  if (!api) return { ok: false, error: "当前版本不支持逐步编排（请升级客户端）" };
  return api.stop({ teamTaskId });
}

/** 删除团队任务（先停止再调后端 DELETE） */
export async function deleteTeamTask(payload: { token: string; teamId?: number; teamTaskId: number }): Promise<{ ok: boolean; error?: string }> {
  const api = window.electronAPI?.hermesOrchestrate;
  if (!api) return { ok: false, error: "当前版本不支持逐步编排（请升级客户端）" };
  return api.deleteTask(payload);
}
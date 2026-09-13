// 定时任务调度器（渲染进程）— 软件开着才执行
// 每 30s 轮询到期定时任务：fire 占位 → 按「执行方式」分流执行 → fired 回执
//   · executeKind=flow：直跑业务流引擎（Python 业务流，确定、快、省）
//   · executeKind=llm ：创建团队任务（executionRef=sched:id:ts）→ 提交 Hermes 逐步编排（默认）
// 每次触发写一条本地执行日志（local_scheduled_runs），成功/失败均回填；后端据 fired 推进下次时间并记录 lastError
import * as scheduledApi from "@/api/scheduled-task-api";
import * as teamApi from "@/api/team-api";
import { submitStepRunner } from "@/pages/TaskCenter/task-runner";
import type { UnifiedTask } from "@/pages/TaskCenter/unified";

const TICK_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/** 业务流参数解析（非法 JSON 抛错，避免把坏参数丢给执行体） */
function parseFlowParams(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("业务流参数必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

/**
 * 执行一次已占位的定时任务（fire 之后调用）。
 * claimed 为 fire 返回的任务（含最新字段），item 为轮询/手动传入的原始任务。
 */
async function executeClaimed(
  token: string,
  item: scheduledApi.ScheduledTask,
  claimed: scheduledApi.ScheduledTask,
): Promise<{ executed: boolean; error?: string }> {
  const execRef = `sched:${item.id}:${Date.now()}`;
  const executeKind = (claimed.executeKind ?? item.executeKind) ?? "llm";
  const flowId = (claimed.flowId ?? item.flowId ?? "").trim();

  // 执行日志（写失败不影响主流程；降级模式返回 null）
  const run = await window.electronAPI?.db?.scheduledRuns
    ?.create({
      scheduledId: item.id,
      userId: 0,
      title: claimed.title,
      executeKind,
      flowId: flowId || null,
    })
    .catch(() => null);
  const runId = run?.id;
  const startTime = Date.now();

  /** 回填执行日志（尽力而为） */
  const finishLog = async (
    patch: Parameters<NonNullable<typeof window.electronAPI.db.scheduledRuns>["finish"]>[1],
  ) => {
    if (!runId) return;
    await window.electronAPI?.db?.scheduledRuns?.finish(runId, patch).catch(() => undefined);
  };

  try {
    // 执行方式分流：flow=直跑业务流引擎（确定、快），llm=交给 Hermes 逐步编排（默认）
    if (executeKind === "flow") {
      if (!flowId) throw new Error("执行方式为业务流但未指定业务流 id");
      const params = parseFlowParams(claimed.flowParams ?? item.flowParams);
      const result = await window.electronAPI.flow.run(flowId, { params });
      if (!result?.ok) {
        throw new Error(`业务流执行失败[${result?.code ?? "FLOW_FAILED"}]：${result?.error ?? "未知错误"}`);
      }
      await scheduledApi.firedScheduledTask(item.id, { success: true });
      await finishLog({
        status: "success",
        resultSummary: result.data ? JSON.stringify(result.data).slice(0, 500) : null,
        durationMs: result.durationMs ?? Date.now() - startTime,
      });
      return { executed: true };
    }

    // 1) 选择执行团队：任务指定优先，否则用户第一个团队
    let teamId = claimed.teamId ?? null;
    if (!teamId) {
      const teams = await teamApi.listTeams();
      teamId = teams[0]?.id ?? null;
    }
    if (!teamId) {
      throw new Error("没有可用团队，请先在团队页创建团队");
    }
    // 2) 创建团队任务（带批次引用，任务中心按一次触发分组）
    const created = await teamApi.createTask(teamId, {
      title: claimed.title,
      description: claimed.description ?? claimed.title,
      executionRef: execRef,
    });
    // 3) 提交 Hermes 逐步编排（定时任务无人值守，默认 Hermes 评审）
    const pseudo: UnifiedTask = {
      key: "team:" + created.id,
      source: "team",
      title: created.title,
      status: "todo",
      rawStatus: "pending",
      createdAt: new Date().toISOString(),
      executionRef: execRef,
    };
    const submit = await submitStepRunner({
      token,
      teamId,
      taskId: created.id,
      task: pseudo,
      autoConfirm: true,
    });
    if (!submit.ok) {
      throw new Error(submit.error || "提交 Hermes 编排失败");
    }
    await scheduledApi.firedScheduledTask(item.id, { success: true });
    await finishLog({
      status: "success",
      resultSummary: `已提交 Hermes 编排（团队任务 #${created.id}）`,
      durationMs: Date.now() - startTime,
    });
    return { executed: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await scheduledApi.firedScheduledTask(item.id, { success: false, error: msg });
    } catch {
      /* 回执失败不影响结果 */
    }
    await finishLog({ status: "error", errorMessage: msg.slice(0, 2000), durationMs: Date.now() - startTime });
    return { executed: true, error: msg };
  }
}

/** 尝试执行一次到期任务；fire 未到期会抛错（忽略）。返回是否执行了 */
export async function runOneScheduledTask(
  token: string,
  item: scheduledApi.ScheduledTask,
): Promise<{ executed: boolean; error?: string }> {
  if (item.status !== "active" || !item.nextRunAt) return { executed: false };
  if (new Date(item.nextRunAt).getTime() > Date.now() + 5000) return { executed: false };

  let claimed: scheduledApi.ScheduledTask;
  try {
    claimed = await scheduledApi.fireScheduledTask(item.id);
  } catch {
    return { executed: false }; // 未到期或正在触发中
  }
  return executeClaimed(token, item, claimed);
}

/**
 * 手动「立即执行」：不受 nextRunAt 限制，但仍走 fire 占位（防并发重复触发）。
 * 供官署详情/任务中心的手动触发使用。
 */
export async function runScheduledTaskNow(
  token: string,
  item: scheduledApi.ScheduledTask,
): Promise<{ executed: boolean; error?: string }> {
  let claimed: scheduledApi.ScheduledTask;
  try {
    claimed = await scheduledApi.fireScheduledTask(item.id);
  } catch (err) {
    return { executed: false, error: err instanceof Error ? err.message : "正在触发中或任务不可用" };
  }
  return executeClaimed(token, item, claimed);
}

/** 单轮轮询：扫描所有 active 定时任务并执行到期项（逐任务隔离错误） */
export async function runScheduledTick(token: string): Promise<{ executed: number; errors: number }> {
  const list = await scheduledApi.listScheduledTasks();
  let executed = 0;
  let errors = 0;
  for (const item of list) {
    try {
      const r = await runOneScheduledTask(token, item);
      if (r.executed) {
        executed += 1;
        if (r.error) errors += 1;
      }
    } catch {
      /* 单任务异常不阻塞整轮 */
    }
  }
  return { executed, errors };
}

/** 启动调度器（登录后调用；未登录/后端不可达时静默跳过）
 *  注意：主进程已开启「后台常驻」引擎时，渲染层不再重复轮询（避免双触发；后端 fire 虽有 10 分钟窗口兜底）。
 *  当后台常驻关闭（或旧版本无此 API）时，渲染层调度器作为窗口内兑底。
 */
export function startScheduledRunner(getToken: () => string | null): void {
  if (timer) return;
  // 后台常驻引擎开启时，交给主进程，不再在渲染层重复轮询
  const bg = window.electronAPI?.cronEngine;
  if (bg) {
    void bg
      .getState()
      .then((s) => {
        if (!s?.enabled) timer = buildTickTimer(getToken);
      })
      .catch(() => {
        timer = buildTickTimer(getToken);
      });
    return;
  }
  timer = buildTickTimer(getToken);
}

/** 构建轮询定时器（启动后立即跑一次，让刚创建的近期任务尽快触发） */
function buildTickTimer(getToken: () => string | null): ReturnType<typeof setInterval> {
  const t = setInterval(() => {
    if (ticking) return;
    const token = getToken();
    if (!token) return;
    ticking = true;
    runScheduledTick(token)
      .catch(() => undefined)
      .finally(() => {
        ticking = false;
      });
  }, TICK_MS);
  const token = getToken();
  if (token) {
    ticking = true;
    runScheduledTick(token)
      .catch(() => undefined)
      .finally(() => {
        ticking = false;
      });
  }
  return t;
}

export function stopScheduledRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

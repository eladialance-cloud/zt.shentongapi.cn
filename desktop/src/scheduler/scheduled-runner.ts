// 定时任务调度器（渲染进程）— 软件开着才执行
// 每 30s 轮询到期定时任务：fire 占位 → 创建团队任务（executionRef=sched:id:ts）→ 提交 Hermes 逐步编排（自评确认）
// 触发失败/编排失败会回执 fired(success:false)，后端推进下次时间并记录 lastError
import * as scheduledApi from "@/api/scheduled-task-api";
import * as teamApi from "@/api/team-api";
import { submitStepRunner } from "@/pages/TaskCenter/task-runner";
import type { UnifiedTask } from "@/pages/TaskCenter/unified";

const TICK_MS = 30_000;

let timer: ReturnType<typeof setInterval> | null = null;
let ticking = false;

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

  const execRef = `sched:${item.id}:${Date.now()}`;
  try {
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
    return { executed: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await scheduledApi.firedScheduledTask(item.id, { success: false, error: msg });
    } catch {
      /* 回执失败不影响结果 */
    }
    return { executed: true, error: msg };
  }
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

/** 启动调度器（登录后调用；未登录/后端不可达时静默跳过） */
export function startScheduledRunner(getToken: () => string | null): void {
  if (timer) return;
  timer = setInterval(() => {
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
  // 启动后立即跑一次（让刚创建的近期任务尽快触发）
  const token = getToken();
  if (token) {
    ticking = true;
    runScheduledTick(token)
      .catch(() => undefined)
      .finally(() => {
        ticking = false;
      });
  }
}

export function stopScheduledRunner(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

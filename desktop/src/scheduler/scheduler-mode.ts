// 定时任务执行方判定（纯函数，便于单测）
//
// 背景：定时任务曾由两套调度器执行 —— 主进程常驻引擎（cron-engine，窗口关闭仍跑）
// 与渲染层轮询（scheduled-runner，关窗口即停）。两者靠事件互停避免双触发，但启动瞬间
// 存在双跑窗口。这里把「谁来跑」变成一次显式判定：主进程开着就不启动渲染层。
export type SchedulerMode = "main" | "renderer";

export function decideSchedulerMode(
  engineState: { enabled?: boolean } | null | undefined,
  hasEngineApi: boolean,
): SchedulerMode {
  if (!hasEngineApi) return "renderer";
  return engineState?.enabled === true ? "main" : "renderer";
}
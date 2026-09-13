// 定时任务「执行方式」分流测试 — flow 直跑业务流 / llm 交 Hermes 编排
// 锚点：src/scheduler/scheduled-runner.ts runOneScheduledTask

import * as scheduledApi from "@/api/scheduled-task-api";
// 用工厂 mock，避免加载真实 api（其 http-client 含 import.meta，jest CJS 环境无法解析）
jest.mock("@/api/scheduled-task-api", () => ({
  fireScheduledTask: jest.fn(),
  firedScheduledTask: jest.fn(),
  listScheduledTasks: jest.fn(),
}));
jest.mock("@/api/team-api", () => ({
  listTeams: jest.fn(),
  createTask: jest.fn(),
}));
jest.mock("@/pages/TaskCenter/task-runner", () => ({
  submitStepRunner: jest.fn(),
}));

import * as teamApi from "@/api/team-api";
import { submitStepRunner } from "@/pages/TaskCenter/task-runner";
import { runOneScheduledTask, runScheduledTaskNow } from "@/scheduler/scheduled-runner";

const mockedFire = scheduledApi.fireScheduledTask as unknown as jest.Mock;
const mockedFired = scheduledApi.firedScheduledTask as unknown as jest.Mock;
const mockedTeams = teamApi as unknown as { listTeams: jest.Mock; createTask: jest.Mock };
const mockedSubmit = submitStepRunner as unknown as jest.Mock;

/** 构造一个「已到期」的定时任务 */
function dueTask(overrides: Partial<scheduledApi.ScheduledTask> = {}): scheduledApi.ScheduledTask {
  return {
    id: 7,
    userId: 1,
    title: "每日海报",
    description: "生成每日海报",
    teamId: 3,
    repeatType: "daily",
    runTime: "08:30",
    weekday: null,
    dueAt: null,
    nextRunAt: new Date(Date.now() - 1000).toISOString(),
    status: "active",
    firingToken: null,
    lastRunAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("定时任务执行方式分流", () => {
  const runMock = jest.fn();
  const createLog = jest.fn(async () => ({ id: 1 }));
  const finishLog = jest.fn(async () => undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { electronAPI: { flow: unknown; db: unknown } }).electronAPI = {
      flow: { run: runMock, list: jest.fn() },
      db: { scheduledRuns: { create: createLog, finish: finishLog, list: jest.fn() } },
    };
    mockedFire.mockImplementation(async (id: number) => dueTask({ id }));
    mockedFired.mockResolvedValue(dueTask());
    mockedTeams.listTeams.mockResolvedValue([{ id: 3, name: "t" }]);
  });

  it("未到期/非 active 的任务不执行", async () => {
    const r = await runOneScheduledTask("t", dueTask({ nextRunAt: new Date(Date.now() + 60_000).toISOString() }));
    expect(r.executed).toBe(false);
    expect(mockedFire).not.toHaveBeenCalled();
  });

  it("executeKind=flow 时直跑业务流，不创建团队任务、不交 Hermes", async () => {
    runMock.mockResolvedValue({ ok: true, flow: "secretary-daily-poster", durationMs: 12 });
    const r = await runOneScheduledTask(
      "t",
      dueTask({ executeKind: "flow", flowId: "secretary-daily-poster", flowParams: '{"date":"2026-09-11"}' }),
    );
    expect(r.executed).toBe(true);
    expect(r.error).toBeUndefined();
    expect(runMock).toHaveBeenCalledWith("secretary-daily-poster", { params: { date: "2026-09-11" } });
    expect(mockedTeams.createTask).not.toHaveBeenCalled();
    expect(mockedSubmit).not.toHaveBeenCalled();
    expect(mockedFired).toHaveBeenCalledWith(7, { success: true });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({ scheduledId: 7, executeKind: "flow", flowId: "secretary-daily-poster" }));
    expect(finishLog).toHaveBeenCalledWith(1, expect.objectContaining({ status: "success" }));
  });

  it("业务流失败时回执 success:false 并带错误", async () => {
    runMock.mockResolvedValue({
      ok: false,
      flow: "sales-service-add-friend",
      code: "RISK_DISABLED",
      error: "高风险业务流未开启",
      durationMs: 5,
    });
    const r = await runOneScheduledTask(
      "t",
      dueTask({ executeKind: "flow", flowId: "sales-service-add-friend" }),
    );
    expect(r.executed).toBe(true);
    expect(r.error).toContain("RISK_DISABLED");
    expect(mockedFired).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ success: false }),
    );
    expect(finishLog).toHaveBeenCalledWith(1, expect.objectContaining({ status: "error" }));
  });

  it("flow 缺 flowId 时报错，不调用引擎", async () => {
    const r = await runOneScheduledTask("t", dueTask({ executeKind: "flow", flowId: null }));
    expect(r.executed).toBe(true);
    expect(r.error).toContain("未指定业务流");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("flowParams 非法 JSON 时报错", async () => {
    const r = await runOneScheduledTask(
      "t",
      dueTask({ executeKind: "flow", flowId: "x-flow", flowParams: "{not json" }),
    );
    expect(r.executed).toBe(true);
    expect(r.error).toContain("JSON");
    expect(runMock).not.toHaveBeenCalled();
  });

  it("executeKind=llm（缺省）时仍走团队任务 + Hermes 编排", async () => {
    mockedTeams.createTask.mockResolvedValue({ id: 99, title: "每日海报" });
    mockedSubmit.mockResolvedValue({ ok: true });
    const r = await runOneScheduledTask("t", dueTask());
    expect(r.executed).toBe(true);
    expect(mockedTeams.createTask).toHaveBeenCalled();
    expect(mockedSubmit).toHaveBeenCalledWith(expect.objectContaining({ teamId: 3, taskId: 99, autoConfirm: true }));
    expect(runMock).not.toHaveBeenCalled();
  });

  describe("手动立即执行（runScheduledTaskNow）", () => {
    it("不受 nextRunAt 限制，仍走 fire 占位后执行", async () => {
      runMock.mockResolvedValue({ ok: true, flow: "secretary-daily-poster", durationMs: 3 });
      const r = await runScheduledTaskNow(
        "t",
        dueTask({
          executeKind: "flow",
          flowId: "secretary-daily-poster",
          nextRunAt: new Date(Date.now() + 3600_000).toISOString(), // 远未到期
        }),
      );
      expect(mockedFire).toHaveBeenCalledWith(7);
      expect(runMock).toHaveBeenCalledWith("secretary-daily-poster", { params: {} });
      expect(r.executed).toBe(true);
      expect(r.error).toBeUndefined();
    });

    it("触发占位失败（正在触发中）时返回 executed:false 并带原因", async () => {
      mockedFire.mockRejectedValueOnce(new Error("未到期或正在触发中"));
      const r = await runScheduledTaskNow("t", dueTask({ executeKind: "flow", flowId: "x" }));
      expect(r.executed).toBe(false);
      expect(r.error).toContain("正在触发中");
      expect(runMock).not.toHaveBeenCalled();
    });
  });
});

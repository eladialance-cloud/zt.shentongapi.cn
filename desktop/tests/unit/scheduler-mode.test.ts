// 定时任务执行方判定：主进程引擎开着时渲染层必须让位（2026-09-13 架构审查 P0）
import { decideSchedulerMode } from "../../src/scheduler/scheduler-mode";

describe("decideSchedulerMode", () => {
  test("主进程引擎开启 → main", () => {
    expect(decideSchedulerMode({ enabled: true }, true)).toBe("main");
  });
  test("主进程引擎关闭 → renderer", () => {
    expect(decideSchedulerMode({ enabled: false }, true)).toBe("renderer");
  });
  test("没有 cronEngine 接口（非 Electron 环境）→ renderer", () => {
    expect(decideSchedulerMode(null, false)).toBe("renderer");
  });
  test("接口在但取不到状态 → renderer（渲染层兜底，保证任务不被漏跑）", () => {
    expect(decideSchedulerMode(null, true)).toBe("renderer");
    expect(decideSchedulerMode(undefined, true)).toBe("renderer");
  });
});
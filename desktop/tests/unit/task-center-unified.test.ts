// 统一任务中心 unified.ts 单测：状态映射 + 统一模型类型导出
import {
  mapHermesStatus,
  mapTaskStatus,
  mapTeamStatus,
  sortByCreatedAtDesc,
  SOURCE_TAG_META,
  STATUS_COLORS,
  STATUS_TAG_META,
  type UnifiedTask,
} from "@/pages/TaskCenter/unified";

describe("mapTeamStatus 团队任务状态映射", () => {
  it("pending → todo", () => {
    expect(mapTeamStatus("pending")).toBe("todo");
  });

  it("in_progress → running", () => {
    expect(mapTeamStatus("in_progress")).toBe("running");
  });

  it("completed → done", () => {
    expect(mapTeamStatus("completed")).toBe("done");
  });

  it("未知状态走默认分支 → failed", () => {
    expect(mapTeamStatus("unknown")).toBe("failed");
    expect(mapTeamStatus("")).toBe("failed");
  });
});

describe("mapTaskStatus 我的任务状态映射", () => {
  it("queued → todo", () => {
    expect(mapTaskStatus("queued")).toBe("todo");
  });

  it("running → running", () => {
    expect(mapTaskStatus("running")).toBe("running");
  });

  it("success → done", () => {
    expect(mapTaskStatus("success")).toBe("done");
  });

  it("cancelled → cancelled", () => {
    expect(mapTaskStatus("cancelled")).toBe("cancelled");
  });

  it("未知状态走默认分支 → failed", () => {
    expect(mapTaskStatus("error")).toBe("failed");
  });
});

describe("mapHermesStatus Hermes 调用状态映射", () => {
  it("running → running", () => {
    expect(mapHermesStatus("running")).toBe("running");
  });

  it("success → done", () => {
    expect(mapHermesStatus("success")).toBe("done");
  });

  it("timeout / failed → failed", () => {
    expect(mapHermesStatus("timeout")).toBe("failed");
    expect(mapHermesStatus("failed")).toBe("failed");
  });

  it("未知状态走默认分支 → todo", () => {
    expect(mapHermesStatus("stopped")).toBe("todo");
    expect(mapHermesStatus("")).toBe("todo");
  });
});

describe("UnifiedTask 类型导出", () => {
  it("字段完整且可选字段可省略", () => {
    const task: UnifiedTask = {
      key: "team:1",
      source: "team",
      title: "示例任务",
      status: "todo",
      rawStatus: "pending",
      assignee: "张三",
      createdAt: "2026-08-19T08:00:00.000Z",
    };
    expect(task.key).toBe("team:1");
    expect(task.source).toBe("team");
    expect(task.title).toBe("示例任务");
    expect(task.status).toBe("todo");
    expect(task.rawStatus).toBe("pending");
    expect(task.assignee).toBe("张三");
    expect(task.createdAt).toBe("2026-08-19T08:00:00.000Z");
    expect(task.finishedAt).toBeUndefined();
    expect(task.briefId).toBeUndefined();
  });

  it("finishedAt / briefId 可显式填写", () => {
    const task: UnifiedTask = {
      key: "task:2",
      source: "task",
      title: "chat",
      status: "done",
      rawStatus: "success",
      createdAt: "2026-08-19T09:00:00.000Z",
      finishedAt: "2026-08-19T09:01:00.000Z",
      briefId: 7,
    };
    expect(task.finishedAt).toBe("2026-08-19T09:01:00.000Z");
    expect(task.briefId).toBe(7);
  });
});

describe("Tag 文案与颜色映射", () => {
  it("状态 Tag：todo=待执行(default) running=执行中(processing) done=成功(success) failed=失败(error) cancelled=已取消(default)", () => {
    expect(STATUS_TAG_META.todo).toEqual({ label: "待执行", color: "default" });
    expect(STATUS_TAG_META.running).toEqual({ label: "执行中", color: "processing" });
    expect(STATUS_TAG_META.done).toEqual({ label: "成功", color: "success" });
    expect(STATUS_TAG_META.failed).toEqual({ label: "失败", color: "error" });
    expect(STATUS_TAG_META.cancelled).toEqual({ label: "已取消", color: "default" });
  });

  it("来源 Tag：team=团队(blue) task=任务(gold) hermes=Hermes(purple)", () => {
    expect(SOURCE_TAG_META.team).toEqual({ label: "团队", color: "blue" });
    expect(SOURCE_TAG_META.task).toEqual({ label: "任务", color: "gold" });
    expect(SOURCE_TAG_META.hermes).toEqual({ label: "Hermes", color: "purple" });
  });

  it("状态主题色覆盖全部统一状态", () => {
    expect(STATUS_COLORS.todo).toBeTruthy();
    expect(STATUS_COLORS.running).toBeTruthy();
    expect(STATUS_COLORS.done).toBeTruthy();
    expect(STATUS_COLORS.failed).toBeTruthy();
    expect(STATUS_COLORS.cancelled).toBeTruthy();
  });
});

describe("sortByCreatedAtDesc 合并排序", () => {
  it("按 createdAt 倒序排列且不修改原数组", () => {
    const list: UnifiedTask[] = [
      { key: "a", source: "team", title: "早", status: "todo", rawStatus: "pending", createdAt: "2026-08-19T08:00:00.000Z" },
      { key: "b", source: "task", title: "晚", status: "done", rawStatus: "success", createdAt: "2026-08-19T10:00:00.000Z" },
      { key: "c", source: "hermes", title: "中", status: "failed", rawStatus: "failed", createdAt: "2026-08-19T09:00:00.000Z" },
    ];
    const sorted = sortByCreatedAtDesc(list);
    expect(sorted.map((t) => t.key)).toEqual(["b", "c", "a"]);
    expect(list.map((t) => t.key)).toEqual(["a", "b", "c"]);
  });
});
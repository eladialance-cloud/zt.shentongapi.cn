// edict-data.ts 渲染层适配单测：共享看板数据 → UI 模型 / 统计 / 要闻 / 官署卡片
import type { EdictTask } from "@shared/edict-types";
import {
  EDICT_COLUMNS,
  EDICT_STATE_LABEL,
  stateColumnKey,
  toUiTask,
  buildJunjiStats,
  buildNews,
  buildOfficialCards,
  orgToId,
} from "@/pages/TaskCenter/edict-data";

const baseTask = (over: Partial<EdictTask> = {}): EdictTask => ({
  id: "JJC-20260827-001",
  title: "测试旨意",
  state: "Zhongshu",
  flow_log: [],
  progress_log: [],
  todos: [],
  ...over,
});

describe("stateColumnKey 12 态 → 列", () => {
  const all = [
    "Pending", "Taizi", "Zhongshu", "Menxia", "Assigned", "Next",
    "Doing", "Review", "Done", "Blocked", "Cancelled", "PendingConfirm",
  ] as const;
  it("每个状态都有列且列定义存在", () => {
    const keys = new Set(EDICT_COLUMNS.map((c) => c.key));
    for (const s of all) {
      const key = stateColumnKey(s);
      expect(keys.has(key)).toBe(true);
      expect(EDICT_STATE_LABEL[s]).toBeTruthy();
    }
  });
});

describe("toUiTask 任务适配", () => {
  it("映射基础字段与 dept/level", () => {
    const ui = toUiTask(baseTask({ org: "户部", official: "户部尚书", priority: "high" }));
    expect(ui.id).toBe("JJC-20260827-001");
    expect(ui.assignee).toBe("户部");
    expect(ui.dept).toBe("户部");
    expect(ui.level).toBe("heavy");
    expect(ui.rejected).toBe(false);
  });

  it("flow_log 含封驳 → rejected + rejectReason", () => {
    const ui = toUiTask(
      baseTask({
        state: "Menxia",
        flow_log: [
          { at: "2026-08-27T10:00:00Z", from: "门下省", to: "中书省", remark: "❌ 封驳：缺支付合规项" },
        ],
      }),
    );
    expect(ui.rejected).toBe(true);
    expect(ui.rejectReason).toContain("封驳");
  });

  it("轻级任务默认 level=light", () => {
    const ui = toUiTask(baseTask({ priority: "low" }));
    expect(ui.level).toBe("light");
  });
});

describe("buildJunjiStats 统计派生", () => {
  it("统计总数/执行中/封驳数", () => {
    const tasks: EdictTask[] = [
      baseTask({ state: "Done", createdAt: "2026-08-27T08:00:00Z", updatedAt: "2026-08-27T09:00:00Z", flow_log: [{ at: "x", from: "门下省", to: "中书省", remark: "封驳" }] }),
      baseTask({ id: "JJC-20260827-002", title: "t2", state: "Doing", createdAt: "2026-08-27T08:10:00Z", updatedAt: "2026-08-27T08:20:00Z" }),
      baseTask({ id: "JJC-20260827-003", title: "t3", state: "Done", createdAt: "2026-08-26T08:00:00Z", updatedAt: "2026-08-26T09:00:00Z" }),
    ];
    const st = buildJunjiStats(tasks);
    expect(st.executing).toBe(1);
    expect(st.rejected).toBe(1);
    expect(st.doneToday).toBe(1);
    expect(st.avgMinutes).toBe(60);
  });
});

describe("buildNews 要闻派生", () => {
  it("取最近 flow_log 事件并排序", () => {
    const tasks: EdictTask[] = [
      baseTask({
        flow_log: [
          { at: "2026-08-27T09:00:00Z", from: "中书省", to: "门下省", remark: "📋 规划完成" },
          { at: "2026-08-27T08:00:00Z", from: "门下省", to: "中书省", remark: "🔨 封驳：缺项" },
        ],
      }),
    ];
    const news = buildNews(tasks, 5);
    expect(news.length).toBe(2);
    expect(news[0].time).toBeDefined();
    expect(news[0].action).toContain("规划完成");
    expect(news.find((n) => n.action.includes("封驳"))?.tone).toBe("reject");
  });
});

describe("buildOfficialCards 官署卡片", () => {
  it("忙闲状态与待办/完成计数", () => {
    const tasks: EdictTask[] = [
      baseTask({ id: "a", title: "a", org: "户部", official: "户部尚书", state: "Doing" }),
      baseTask({ id: "b", title: "b", org: "户部", official: "户部尚书", state: "Done" }),
    ];
    const cards = buildOfficialCards(
      [{ id: "hubu", label: "户部", status: "busy", role: "财务" }],
      tasks,
    );
    const hubu = cards.find((c) => c.id === "hubu");
    expect(hubu?.status).toBe("work");
    expect(hubu?.todoCount).toBe(1);
    expect(hubu?.todayCompleted).toBe(1);
    expect(orgToId("户部")).toBe("hubu");
  });
});

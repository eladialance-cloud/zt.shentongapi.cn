// 工作台改造（Task 2）：Dashboard 聚合纯函数单测
// 覆盖：待审核过滤 / 进行中任务过滤 / 今日发布过滤 / 团队忙闲聚合 / 本周任务数
import {
  aggregateTeamStatus,
  countWeekTasks,
  filterInProgress,
  filterPendingReview,
  isInProgressTask,
  isPendingReview,
  platformLabel,
  todayPlans,
  type TeamStatusRow,
} from "@/pages/Dashboard/cards";
import type { PublishPlan } from "@/types/channel";
import type { UnifiedTaskItem } from "@/api/task-api";
import type { Team, TeamMember, TeamTask } from "@/types/team";

function plan(partial: Partial<PublishPlan>): PublishPlan {
  return {
    id: 1,
    title: "测试计划",
    targetPlatforms: ["douyin"],
    mode: "manual",
    status: "draft",
    reviewStatus: "approved",
    userId: 1,
    createdAt: "2026-08-19T08:00:00.000Z",
    ...partial,
  } as PublishPlan;
}

function task(partial: Partial<UnifiedTaskItem>): UnifiedTaskItem {
  return {
    source: "task",
    sourceId: 1,
    title: "测试任务",
    status: "todo",
    rawStatus: "queued",
    createdAt: "2026-08-19T08:00:00.000Z",
    ...partial,
  } as UnifiedTaskItem;
}

describe("filterPendingReview 待审核队列", () => {
  it("只保留 status=pending_review 的计划", () => {
    const list = [
      plan({ id: 1, status: "pending_review", createdAt: "2026-08-19T08:00:00.000Z" }),
      plan({ id: 2, status: "draft" }),
      plan({ id: 3, status: "approved" }),
      plan({ id: 4, status: "published" }),
    ];
    const result = filterPendingReview(list, 5);
    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it("兼容 reviewStatus=pending 的旧数据", () => {
    expect(isPendingReview(plan({ status: "approved", reviewStatus: "pending" }))).toBe(true);
    expect(isPendingReview(plan({ status: "draft", reviewStatus: "approved" }))).toBe(false);
  });

  it("按创建时间倒序取前 N", () => {
    const list = [
      plan({ id: 1, status: "pending_review", createdAt: "2026-08-19T08:00:00.000Z" }),
      plan({ id: 2, status: "pending_review", createdAt: "2026-08-19T10:00:00.000Z" }),
      plan({ id: 3, status: "pending_review", createdAt: "2026-08-19T09:00:00.000Z" }),
      plan({ id: 4, status: "pending_review", createdAt: "2026-08-18T07:00:00.000Z" }),
    ];
    expect(filterPendingReview(list, 2).map((p) => p.id)).toEqual([2, 3]);
    expect(filterPendingReview(list, 5).map((p) => p.id)).toEqual([2, 3, 1, 4]);
  });

  it("不修改原数组", () => {
    const list = [
      plan({ id: 1, status: "pending_review", createdAt: "2026-08-19T08:00:00.000Z" }),
      plan({ id: 2, status: "pending_review", createdAt: "2026-08-19T10:00:00.000Z" }),
    ];
    filterPendingReview(list, 5);
    expect(list.map((p) => p.id)).toEqual([1, 2]);
  });

  it("空数组返回空数组", () => {
    expect(filterPendingReview([], 5)).toEqual([]);
  });
});

describe("filterInProgress 进行中任务", () => {
  it("只保留 unified status=running 的任务", () => {
    const list = [
      task({ sourceId: 1, status: "running", rawStatus: "running" }),
      task({ sourceId: 2, status: "todo", rawStatus: "queued" }),
      task({ sourceId: 3, status: "done", rawStatus: "success" }),
      task({ sourceId: 4, status: "failed" }),
    ];
    expect(isInProgressTask(list[0])).toBe(true);
    expect(filterInProgress(list, 5).map((t) => t.sourceId)).toEqual([1]);
  });

  it("按创建时间倒序取前 N（默认 3）", () => {
    const list = [
      task({ sourceId: 1, status: "running", createdAt: "2026-08-19T08:00:00.000Z" }),
      task({ sourceId: 2, status: "running", createdAt: "2026-08-19T10:00:00.000Z" }),
      task({ sourceId: 3, status: "running", createdAt: "2026-08-19T09:00:00.000Z" }),
      task({ sourceId: 4, status: "running", createdAt: "2026-08-19T11:00:00.000Z" }),
    ];
    expect(filterInProgress(list).map((t) => t.sourceId)).toEqual([4, 2, 3]);
    expect(filterInProgress(list, 2).map((t) => t.sourceId)).toEqual([4, 2]);
  });
});

describe("todayPlans 今日发布", () => {
  // 用本地时间构造 ISO，保证任何时区下 dayKey 都落在预期日期
  const localIso = (day: number, hour: number, minute = 0) =>
    new Date(2026, 7, day, hour, minute).toISOString();

  const list = [
    plan({ id: 1, scheduledAt: localIso(19, 9, 30) }),
    plan({ id: 2, scheduledAt: localIso(19, 15) }),
    plan({ id: 3, scheduledAt: localIso(20, 9) }),
    plan({ id: 4, scheduledAt: undefined }),
  ];

  it("按 scheduledAt 的 YYYY-MM-DD 过滤", () => {
    expect(todayPlans(list, "2026-08-19").map((p) => p.id)).toEqual([1, 2]);
    expect(todayPlans(list, "2026-08-20").map((p) => p.id)).toEqual([3]);
  });

  it("按排期时间升序排列", () => {
    const later = [
      plan({ id: 5, scheduledAt: localIso(19, 18) }),
      plan({ id: 6, scheduledAt: localIso(19, 6) }),
    ];
    expect(todayPlans(later, "2026-08-19").map((p) => p.id)).toEqual([6, 5]);
  });

  it("忽略非法时间与空 scheduledAt", () => {
    const bad = [plan({ id: 7, scheduledAt: "not-a-date" })];
    expect(todayPlans([...list, ...bad], "2026-08-19").map((p) => p.id)).toEqual([1, 2]);
  });
});

describe("aggregateTeamStatus 团队忙闲聚合", () => {
  const teams: Team[] = [
    { id: 1, name: "内容团队", memberCount: 2, creatorId: 1, createdAt: "2026-08-01T00:00:00.000Z" },
    { id: 2, name: "增长团队", memberCount: 1, creatorId: 1, createdAt: "2026-08-01T00:00:00.000Z" },
  ];
  const member = (teamId: number, isActive: boolean): TeamMember =>
    ({
      id: teamId * 10 + (isActive ? 1 : 2),
      teamId,
      agentId: "agent-" + teamId,
      agentName: "成员" + teamId,
      roleTitle: "成员",
      sortOrder: 0,
      isActive,
      addedBy: 1,
      joinedAt: "2026-08-01T00:00:00.000Z",
    } as TeamMember);

  const membersByTeam = new Map<number, TeamMember[]>([
    [1, [member(1, true), member(1, false)]],
    [2, [member(2, true)]],
  ]);
  const weekCounts = new Map<number, number>([
    [1, 5],
    [2, 2],
  ]);

  it("返回 { id, name, total, busy, idle, weekCount } 结构", () => {
    const rows = aggregateTeamStatus(teams, membersByTeam, weekCounts);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ id: 1, name: "内容团队", total: 2, busy: 1, idle: 1, weekCount: 5 });
    expect(rows[1]).toEqual({ id: 2, name: "增长团队", total: 1, busy: 1, idle: 0, weekCount: 2 });
  });

  it("缺少成员数据时 busy/idle 为 0，weekCount 缺省为 0", () => {
    const rows = aggregateTeamStatus(teams, new Map(), new Map());
    expect(rows[0]).toEqual({ id: 1, name: "内容团队", total: 2, busy: 0, idle: 0, weekCount: 0 });
  });

  it("memberCount 为 0 时以成员数回退", () => {
    const rows = aggregateTeamStatus(
      [{ id: 3, name: "新团队", memberCount: 0, creatorId: 1, createdAt: "2026-08-01T00:00:00.000Z" }],
      new Map([[3, [member(3, true), member(3, true)]]]),
      new Map(),
    );
    expect(rows[0].total).toBe(2);
    expect(rows[0].busy).toBe(2);
    expect(rows[0].idle).toBe(0);
  });

  it("类型检查：TeamStatusRow 字段完整", () => {
    const rows: TeamStatusRow[] = aggregateTeamStatus(teams, membersByTeam, weekCounts);
    expect(rows.every((r) => typeof r.weekCount === "number")).toBe(true);
  });
});

describe("countWeekTasks 本周任务数", () => {
  const now = new Date("2026-08-19T12:00:00.000Z");
  const teamTask = (createdAt: string): TeamTask =>
    ({
      id: 1,
      teamId: 1,
      title: "t",
      status: "pending",
      priority: "medium",
      creatorId: 1,
      createdAt,
    } as TeamTask);

  it("统计最近 7 天（含今天）内创建的任务", () => {
    // 日期刻意远离 7 天边界（无论进程时区，结果一致）
    const tasks = [
      teamTask("2026-08-19T10:00:00.000Z"), // 今天
      teamTask("2026-08-13T12:00:00.000Z"), // 一周内
      teamTask("2026-08-10T00:00:00.000Z"), // 一周外
    ];
    expect(countWeekTasks(tasks, now)).toBe(2);
  });

  it("非法时间不计入", () => {
    expect(countWeekTasks([teamTask("bad-date")], now)).toBe(0);
  });
});

describe("platformLabel 平台展示", () => {
  it("单平台直接展示 emoji 标签", () => {
    expect(platformLabel(["douyin"])).toBe("🎵 抖音");
  });

  it("多平台取前 2 个并显示总数", () => {
    expect(platformLabel(["douyin", "xiaohongshu", "weibo"])).toBe("🎵 抖音 / 📕 小红书 等3个");
  });

  it("未知平台回退为原始 key", () => {
    expect(platformLabel(["unknown_platform"])).toBe("unknown_platform");
  });

  it("空平台显示占位文案", () => {
    expect(platformLabel([])).toBe("未选平台");
  });
});

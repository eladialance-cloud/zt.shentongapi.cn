// 任务中心动态流水线 pipeline.ts 单测：Hermes 拆解解析 / 动作矩阵 / 候选选题
import {
  parsePipeline,
  parseTeamSteps,
  pipelineActions,
  taskQuickAction,
  topicCandidates,
  type PipelineAction,
  type PipelineStep,
  type TaskOutputItem,
} from "@/pages/TaskCenter/pipeline";
import type { UnifiedTask } from "@/pages/TaskCenter/unified";

const task: UnifiedTask = {
  key: "task:1",
  source: "task",
  title: "小红书爆款笔记",
  status: "running",
  rawStatus: "running",
  createdAt: "2026-08-19T08:00:00.000Z",
};

function outputItem(partial: Partial<TaskOutputItem> = {}): TaskOutputItem {
  return { id: 1, taskId: 1, ...partial };
}

describe("parsePipeline 合法 JSON 解析", () => {
  it("contentJson.pipeline 数组 → 动态步骤（含 agentName/agentId 与状态映射）", () => {
    const outputs = [
      outputItem({
        contentJson: {
          pipeline: [
            { step: "选题", agentId: 1, agentName: "Hermes 总编", status: "done" },
            { step: "素材收集", agentId: 2, agentName: "素材专员", status: "running" },
            { step: "文案撰写", agentId: 3, agentName: "文案专员", status: "pending" },
          ],
        },
      }),
    ];
    const steps = parsePipeline(task, outputs);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual({
      step: "选题",
      agentId: 1,
      agentName: "Hermes 总编",
      status: "done",
    });
    expect(steps[1]).toEqual({
      step: "素材收集",
      agentId: 2,
      agentName: "素材专员",
      status: "active",
    });
    expect(steps[2]).toEqual({
      step: "文案撰写",
      agentId: 3,
      agentName: "文案专员",
      status: "waiting",
    });
  });

  it("contentJson 直接为数组、metadata.pipeline 兜底、首个合法项优先", () => {
    const outputs = [
      outputItem({ content: "无关文本", contentJson: { candidates: ["a"] } }),
      outputItem({
        contentJson: [{ step: "初审", status: "done" }],
        metadata: { pipeline: [{ step: "终审", status: "running" }] },
      }),
    ];
    const steps = parsePipeline(task, outputs);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ step: "初审", status: "done" });
  });
});

describe("parsePipeline 缺失字段兜底", () => {
  it("步骤缺 status → waiting；缺 agentName/agentId → 省略字段", () => {
    const outputs = [
      outputItem({
        contentJson: { pipeline: [{ step: "发布", agentId: 9 }] },
      }),
    ];
    const steps = parsePipeline(task, outputs);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ step: "发布", agentId: 9, status: "waiting" });
    expect(steps[0].agentName).toBeUndefined();
  });

  it("缺 step 的非法条目被跳过；全部跳过时回退单步推导", () => {
    const outputs = [
      outputItem({ contentJson: { pipeline: [{ status: "done" }, "garbage", null] } }),
    ];
    const steps = parsePipeline(task, outputs);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ step: "执行中", status: "active" });
  });
});

describe("parsePipeline 非法 JSON 兜底", () => {
  it("outputs 为 null/undefined/空数组 → 按状态推导单步", () => {
    expect(parsePipeline(task, null)).toEqual([{ step: "执行中", status: "active" }]);
    expect(parsePipeline(task, undefined)).toEqual([{ step: "执行中", status: "active" }]);
    expect(parsePipeline(task, [])).toEqual([{ step: "执行中", status: "active" }]);
  });

  it("contentJson 为非法字符串/普通对象（无 pipeline）→ 回退单步", () => {
    const outputs = [
      outputItem({ contentJson: "{ not valid json" }),
      outputItem({ contentJson: { candidates: ["a"] } }),
    ];
    const steps = parsePipeline(task, outputs);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ step: "执行中", status: "active" });
  });

  it("首个输出项 pipeline 为空数组时不短路，继续找后续合法项", () => {
    const outputs = [
      outputItem({ contentJson: { pipeline: [] } }),
      outputItem({
        contentJson: { pipeline: [{ step: "终审", agentName: "总编", status: "running" }] },
      }),
    ];
    const steps = parsePipeline(task, outputs);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ step: "终审", agentName: "总编", status: "active" });
  });
});

describe("parsePipeline 单步推导（无拆解 JSON）", () => {
  it("todo → 待执行(waiting)", () => {
    expect(parsePipeline({ ...task, status: "todo" }, null)).toEqual([
      { step: "待执行", status: "waiting" },
    ]);
  });
  it("running → 执行中(active)", () => {
    expect(parsePipeline({ ...task, status: "running" }, null)).toEqual([
      { step: "执行中", status: "active" },
    ]);
  });
  it("done → 已完成(done)", () => {
    expect(parsePipeline({ ...task, status: "done" }, null)).toEqual([
      { step: "已完成", status: "done" },
    ]);
  });
  it("failed → 执行失败 / cancelled → 已取消（终态）", () => {
    expect(parsePipeline({ ...task, status: "failed" }, null)).toEqual([
      { step: "执行失败", status: "done" },
    ]);
    expect(parsePipeline({ ...task, status: "cancelled" }, null)).toEqual([
      { step: "已取消", status: "done" },
    ]);
  });
});

describe("pipelineActions 老板动作矩阵", () => {
  it("active 步含「选题」→ 去选择(select-topic)", () => {
    const action: PipelineAction | null = pipelineActions(task, {
      step: "选题",
      agentName: "Hermes 总编",
      status: "active",
    });
    expect(action).toEqual({ label: "去选择", kind: "select-topic" });
  });

  it("active 步含「终审/审核/初审」→ 通过/打回(approve)", () => {
    expect(pipelineActions(task, { step: "终审", status: "active" })).toEqual({
      label: "通过/打回",
      kind: "approve",
    });
    expect(pipelineActions(task, { step: "人工审核", status: "active" })).toEqual({
      label: "通过/打回",
      kind: "approve",
    });
    expect(pipelineActions(task, { step: "总编初审", status: "active" })).toEqual({
      label: "通过/打回",
      kind: "approve",
    });
  });

  it("active 步不含关键词 → null", () => {
    expect(pipelineActions(task, { step: "素材收集", status: "active" })).toBeNull();
  });

  it("非 active 步（done/waiting）即使含关键词 → null", () => {
    expect(pipelineActions(task, { step: "选题", status: "waiting" })).toBeNull();
    expect(pipelineActions(task, { step: "终审", status: "done" })).toBeNull();
  });
});

describe("topicCandidates 候选选题提取", () => {
  it("contentJson.candidates 字符串数组与 {name}/{title} 对象 → 去重去空", () => {
    const outputs = [
      outputItem({
        contentJson: {
          candidates: [" 爆款选题A ", "爆款选题B", "爆款选题B", "", { name: "选题C" }, { title: "选题D" }],
        },
      }),
    ];
    expect(topicCandidates(outputs)).toEqual([
      "爆款选题A",
      "爆款选题B",
      "选题C",
      "选题D",
    ]);
  });

  it("content 文本行按行提取；无 candidates 时文本行兜底", () => {
    const outputs = [
      outputItem({
        content: "第一候选\n第二候选\n\n",
        contentJson: { candidates: ["候选0"] },
      }),
      outputItem({ content: "行候选A\n行候选B" }),
    ];
    const candidates = topicCandidates(outputs);
    expect(candidates).toContain("候选0");
    expect(candidates).toContain("第一候选");
    expect(candidates).toContain("第二候选");
    expect(candidates).toContain("行候选A");
    expect(candidates).toContain("行候选B");
  });

  it("无候选 → 空数组（前端允许手输）", () => {
    expect(topicCandidates(null)).toEqual([]);
    expect(topicCandidates(undefined)).toEqual([]);
    expect(topicCandidates([])).toEqual([]);
    expect(topicCandidates([outputItem({ contentJson: { pipeline: [] } })])).toEqual([]);
  });
});

describe("parseTeamSteps（Hermes 编排步骤，团队驱动执行）", () => {
  it("result.steps 数组 → PipelineStep[]（done/active/waiting 映射 + assigneeName）", () => {
    const steps = parseTeamSteps({
      steps: [
        { name: "需求理解", status: "done", assigneeName: "内容AI" },
        { name: "文案撰写", status: "running", assigneeName: "内容AI" },
        { name: "终审", status: "pending" },
      ],
    });
    expect(steps).toEqual([
      { step: "需求理解", status: "done", assigneeName: "内容AI", index: 0 },
      { step: "文案撰写", status: "active", assigneeName: "内容AI", index: 1 },
      { step: "终审", status: "waiting", index: 2 },
    ]);
  });
  it("无 steps 或非法 → []", () => {
    expect(parseTeamSteps(null)).toEqual([]);
    expect(parseTeamSteps({})).toEqual([]);
    expect(parseTeamSteps({ steps: "x" })).toEqual([]);
  });
});

describe("taskQuickAction 任务级快速操作（任务中心开始任务/重试）", () => {
  const teamTask: UnifiedTask = {
    ...task,
    key: "team:1",
    source: "team",
  };

  it("团队待办任务 → 开始任务（todo → in_progress）", () => {
    expect(taskQuickAction({ ...teamTask, status: "todo" })).toEqual({
      kind: "start",
      label: "开始任务",
      status: "in_progress",
      successText: "任务已开始执行",
      description: "[老板] 开始执行任务",
    });
  });

  it("团队失败任务 → 重试（failed → pending）", () => {
    const action = taskQuickAction({ ...teamTask, status: "failed" });
    expect(action).not.toBeNull();
    expect(action?.kind).toBe("retry");
    expect(action?.status).toBe("pending");
    expect(action?.label).toBe("重试");
  });

  it("团队执行中/已完成/已取消 → null", () => {
    expect(taskQuickAction({ ...teamTask, status: "running" })).toBeNull();
    expect(taskQuickAction({ ...teamTask, status: "done" })).toBeNull();
    expect(taskQuickAction({ ...teamTask, status: "cancelled" })).toBeNull();
  });

  it("非团队来源（task/hermes）即使待办 → null", () => {
    expect(taskQuickAction({ ...task, status: "todo" })).toBeNull();
    expect(
      taskQuickAction({ ...task, key: "hermes:1", source: "hermes", status: "todo" })
    ).toBeNull();
  });
});

import {
  appendOfficialOutput,
  edictApprove,
  edictBoard,
  edictComplete,
  edictIssue,
  edictOfficials,
  edictProgress,
  edictRunPipeline,
  edictStats,
  edictTransition,
  edictVeto,
  nextTaskId,
  buildNodePrompt,
  type EdictDeps,
  type EdictTask,
} from "../../electron/main/edict-orchestrator";
import { assertTransition } from "../../electron/main/edict-state-machine";

/** 内存看板 + mock kanban_update.py（模拟脚本行为：create/state/flow/done/block/progress + 状态机校验） */
function makeDeps(overrides: Partial<EdictDeps> = {}): { deps: EdictDeps; store: EdictTask[]; kanbanCalls: string[][] } {
  const store: EdictTask[] = [];
  const kanbanCalls: string[][] = [];
  const spawnKanban: EdictDeps["spawnKanban"] = async (args, env) => {
    const real = args.length > 1 ? args.slice(1) : args;
    kanbanCalls.push(real);
    const [cmd, id, ...rest] = real;
    const task = store.find((t) => t.id === id);
    const ok = (out: string) => ({ code: 0, stdout: out, stderr: "" });
    const fail = (msg: string) => ({ code: 1, stdout: "", stderr: msg });
    if (cmd === "create") {
      const [title, state, org, official, remark] = rest;
      store.push({
        id, title, state: state as EdictTask["state"], org, official,
        flow_log: [{ at: "2026-08-27T00:00:00Z", from: "皇上", to: org, remark: remark || "太子整理旨意" }],
        progress_log: [], todos: [],
        createdAt: "2026-08-27T00:00:00Z", updatedAt: "2026-08-27T00:00:00Z",
      });
      return ok("created " + id);
    }
    if (!task) return fail("任务不存在: " + id);
    if (cmd === "state") {
      const [to, note] = rest;
      const check = assertTransition(task.state as never, to as never);
      if (!check.ok) return fail(check.reason);
      // 高风险转换（照搬 kanban_update.py HIGH_RISK_TRANSITIONS）：Review→Done / Doing→Cancelled / Menxia→Cancelled 拦截进 PendingConfirm
      const highRisk: Record<string, string> = { "Review>Done": "menxia", "Doing>Cancelled": "shangshu", "Menxia>Cancelled": "zhongshu" };
      const key = (task.state as string) + ">" + to;
      if (highRisk[key]) {
        task.state = "PendingConfirm" as EdictTask["state"];
        task.updatedAt = "2026-08-27T00:00:01Z";
        (task as any).pending_confirm = { target_state: to, confirm_by: highRisk[key] };
        task.flow_log.push({ at: "2026-08-27T00:00:01Z", from: task.org || "", to: "PendingConfirm", remark: note || to, agent: (env?.AGENT_ID || ""), agentLabel: env?.AGENT_ID || "" });
        return ok("pending_confirm " + to);
      }
      task.state = to as EdictTask["state"];
      task.updatedAt = "2026-08-27T00:00:01Z";
      task.flow_log.push({ at: "2026-08-27T00:00:01Z", from: task.org || "", to: to, remark: note || to, agent: (env?.AGENT_ID || ""), agentLabel: env?.AGENT_ID || "" });
      if (to === "Blocked") task.block = note;
      return ok("state " + to);
    }
    if (cmd === "confirm") {
      const [action, reason] = rest;
      if (task.state !== "PendingConfirm") return fail("不在 PendingConfirm 状态");
      const pending = (task as any).pending_confirm || {};
      if (action === "approve") {
        const target = pending.target_state || "Done";
        task.state = target as EdictTask["state"];
        task.updatedAt = "2026-08-27T00:00:01Z";
        task.flow_log.push({ at: "2026-08-27T00:00:01Z", from: "PendingConfirm", to: target, remark: reason || "确认通过", agent: (env?.AGENT_ID || ""), agentLabel: env?.AGENT_ID || "" });
        return ok("confirm " + target);
      }
      if (action === "reject") {
        task.state = "Review" as EdictTask["state"];
        task.updatedAt = "2026-08-27T00:00:01Z";
        return ok("confirm reject");
      }
      return fail("未知 confirm action: " + action);
    }
    if (cmd === "flow") {
      const [from, to, remark] = rest;
      task.flow_log.push({ at: "2026-08-27T00:00:01Z", from, to, remark });
      return ok("flow ok");
    }
    if (cmd === "done") {
      const [output, summary] = rest;
      // 照搬 kanban_update.py cmd_done：仅 Doing/Next 可上报完成 → Review（非终态 Done）
      if (!["Doing", "Next"].includes(task.state as string)) return fail("当前状态 " + task.state + " 不允许直接上报完成");
      task.state = "Review" as EdictTask["state"];
      task.output = output || "";
      task.now = summary || "";
      task.updatedAt = "2026-08-27T00:00:02Z";
      return ok("done -> Review");
    }
    if (cmd === "block") {
      const [reason] = rest;
      task.state = "Blocked";
      task.block = reason || "";
      return ok("block ok");
    }
    if (cmd === "progress") {
      const [text] = rest;
      task.progress_log.push({ at: "2026-08-27T00:00:01Z", agent: env?.AGENT_ID || "", text: text || "" });
      return ok("progress ok");
    }
    if (cmd === "todo") return ok("todo ok");
    return fail("未知命令: " + cmd);
  };
  const deps: EdictDeps = {
    spawnKanban,
    runHermes: async () => "",
    readBoard: () => JSON.parse(JSON.stringify(store)),
    writeBoard: (tasks) => { store.length = 0; store.push(...JSON.parse(JSON.stringify(tasks))); return store; },
    now: () => Date.parse("2026-08-27T10:00:00Z"),
    log: () => {},
    ...overrides,
  };
  return { deps, store, kanbanCalls };
}

describe("nextTaskId（JJC-YYYYMMDD-NNN）", () => {
  it("空看板 → 001", () => {
    expect(nextTaskId([], () => Date.parse("2026-08-27T10:00:00Z"))).toBe("JJC-20260827-001");
  });
  it("同日递增 / 跨日重置", () => {
    const tasks = [
      { id: "JJC-20260827-001", title: "a", state: "Doing", flow_log: [], progress_log: [], todos: [] } as EdictTask,
      { id: "JJC-20260827-002", title: "b", state: "Doing", flow_log: [], progress_log: [], todos: [] } as EdictTask,
    ];
    expect(nextTaskId(tasks, () => Date.parse("2026-08-27T10:00:00Z"))).toBe("JJC-20260827-003");
    expect(nextTaskId(tasks, () => Date.parse("2026-08-28T10:00:00Z"))).toBe("JJC-20260828-001");
  });
});

describe("edictIssue（下旨建任务）", () => {
  it("建任务 → state=Zhongshu，返回 taskId", async () => {
    const { deps, store } = makeDeps();
    const r = await edictIssue(deps, { title: "调研行业报告", body: "需要输出 5 家竞品分析", dept: "户部" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data?.taskId).toBe("JJC-20260827-001");
    expect(store[0].state).toBe("Zhongshu");
    expect(store[0].title).toBe("调研行业报告");
    expect(store[0].org).toBe("户部");
  });
  it("标题为空 → 拒绝", async () => {
    const { deps } = makeDeps();
    const r = await edictIssue(deps, { title: "  " });
    expect(r.ok).toBe(false);
  });
});

describe("edictTransition / veto / approve（状态机校验 + 封驳）", () => {
  it("非法流转被状态机拒绝", async () => {
    const { deps } = makeDeps();
    await edictIssue(deps, { title: "调研" });
    const r = await edictTransition(deps, "JJC-20260827-001", "Done");
    expect(r.ok).toBe(false);
    expect(r.ok === false ? r.error : "").toContain("非法状态转换");
  });
  it("封驳：门下 → 中书（Review 场景由编排器触发）", async () => {
    const { deps, store } = makeDeps();
    await edictIssue(deps, { title: "调研" });
    // 推进到 Zhongshu→Menxia
    await edictTransition(deps, "JJC-20260827-001", "Menxia", { actorAgentId: "zhongshu" });
    const r = await edictVeto(deps, "JJC-20260827-001", "方案缺少风险评估");
    expect(r.ok).toBe(true);
    expect(store[0].state).toBe("Zhongshu");
    expect(store[0].flow_log.some((f) => f.remark.includes("封驳"))).toBe(true);
  });
  it("封驳原因必填", async () => {
    const { deps } = makeDeps();
    await edictIssue(deps, { title: "调研" });
    const r = await edictVeto(deps, "JJC-20260827-001", "");
    expect(r.ok).toBe(false);
  });
  it("准奏：Menxia → Assigned", async () => {
    const { deps, store } = makeDeps();
    await edictIssue(deps, { title: "调研" });
    await edictTransition(deps, "JJC-20260827-001", "Menxia", { actorAgentId: "zhongshu" });
    const r = await edictApprove(deps, "JJC-20260827-001");
    expect(r.ok).toBe(true);
    expect(store[0].state).toBe("Assigned");
  });
});

describe("edictStats / edictOfficials / edictBoard", () => {
  it("统计与官署忙闲", async () => {
    const { deps, store } = makeDeps();
    // 未指定部门 → org=中书省（中书省 busy）
    await edictIssue(deps, { title: "调研" });
    await edictTransition(deps, "JJC-20260827-001", "Menxia", { actorAgentId: "zhongshu" });
    const stats = edictStats(deps);
    expect(stats.total).toBe(1);
    expect(stats.byState.Menxia).toBe(1);
    expect(stats.active).toBe(1);
    const officials = edictOfficials(deps);
    expect(officials.find((o) => o.id === "zhongshu")?.status).toBe("busy");
    expect(officials.find((o) => o.id === "hubu")?.status).toBe("idle");
    const board = edictBoard(deps);
    expect(board.tasks).toHaveLength(1);
    expect(board.updatedAt).toBeTruthy();
    void store;
  });
});

describe("edictRunPipeline（编排：中书→门下→尚书→六部→完成）", () => {
  it("全流程准奏 → Done", async () => {
    const { deps, store } = makeDeps({
      runHermes: async (profile, _prompt) => {
        if (profile === "zhongshu") return "方案：由户部分析竞品数据，产出对比表。";
        if (profile === "menxia") return "四维审议通过，准奏。";
        if (profile === "shangshu") return "部门：户部。任务令：完成竞品分析并输出对比表。";
        if (profile === "hubu") return "交付摘要：已输出 5 家竞品对比表。";
        return "";
      },
    });
    await edictIssue(deps, { title: "调研竞品" });
    const r = await edictRunPipeline(deps, "JJC-20260827-001");
    expect(r.ok).toBe(true);
    expect(r.ok && r.data?.finalState).toBe("Done");
    expect(store[0].state).toBe("Done");
    expect(store[0].flow_log.some((f) => f.remark.includes("复核通过"))).toBe(true);
    // 关键节点都跑过
    const states = (r.ok && r.data ? r.data.steps : []).map((s) => s.state);
    expect(states).toContain("Menxia");
    expect(states).toContain("Assigned");
    expect(states).toContain("Doing");
    // 产出写回看板：progress_log 有各官署产出记录 + output 字段落最终产出
    expect(store[0].progress_log.some((p) => p.text.includes("产出"))).toBe(true);
    expect(store[0].output).toContain("交付摘要");
  });

  it("封驳一轮 → 打回 Zhongshu → 二轮准奏 → Done", async () => {
    let menxiaCalls = 0;
    const { deps, store } = makeDeps({
      runHermes: async (profile) => {
        if (profile === "zhongshu") return "方案：先做需求调研。";
        if (profile === "menxia") {
          menxiaCalls += 1;
          return menxiaCalls === 1 ? "封驳：方案缺少时间节点。" : "准奏。";
        }
        if (profile === "shangshu") return "部门：礼部。任务令：撰写需求文档。";
        if (profile === "libu") return "交付摘要：需求文档已完成。";
        return "";
      },
    });
    await edictIssue(deps, { title: "需求调研" });
    const r = await edictRunPipeline(deps, "JJC-20260827-001");
    expect(r.ok).toBe(true);
    expect(r.ok && r.data?.finalState).toBe("Done");
    expect(menxiaCalls).toBe(2);
    // 有封驳记录
    expect(store[0].flow_log.some((f) => f.remark.includes("封驳"))).toBe(true);
  });

  it("封驳超限（maxVetoRounds=1）→ 强制准奏", async () => {
    let menxiaCalls = 0;
    const { deps, store } = makeDeps({
      runHermes: async (profile) => {
        if (profile === "zhongshu") return "方案：A。";
        if (profile === "menxia") { menxiaCalls += 1; return "封驳：继续修改。"; }
        if (profile === "shangshu") return "部门：工部。任务令：执行方案A。";
        if (profile === "gongbu") return "交付摘要：完成。";
        return "";
      },
    });
    await edictIssue(deps, { title: "执行方案" });
    const r = await edictRunPipeline(deps, "JJC-20260827-001", { maxVetoRounds: 1 });
    expect(r.ok).toBe(true);
    expect(r.ok && r.data?.finalState).toBe("Done");
    expect(menxiaCalls).toBe(2);
    // 超限后仍完成准奏收口（flow_log 留准奏记录）
    expect(store[0].flow_log.some((f) => f.remark.includes("准奏"))).toBe(true);
  });

  it("Hermes 执行失败 → 停在当前节点并返回错误", async () => {
    const { deps, store } = makeDeps({
      runHermes: async (profile) => {
        if (profile === "zhongshu") throw new Error("模型未配置");
        return "";
      },
    });
    await edictIssue(deps, { title: "调研" });
    const r = await edictRunPipeline(deps, "JJC-20260827-001");
    expect(r.ok).toBe(false);
    expect(r.ok === false ? r.error : "").toContain("Hermes 执行失败");
    // 任务保留在 Zhongshu（可重试）
    expect(store[0].state).toBe("Zhongshu");
    // 失败原因已写回看板 progress_log（UI 可见，不再静默）
    expect(store[0].progress_log.some((p) => p.text.includes("执行失败"))).toBe(true);
  });
});

describe("六部接进流水线（尚书省派发 → 对应部门 profile 执行）", () => {
  const SIX: Array<{ dept: string; profile: string }> = [
    { dept: "户部", profile: "hubu" },
    { dept: "礼部", profile: "libu" },
    { dept: "兵部", profile: "bingbu" },
    { dept: "刑部", profile: "xingbu" },
    { dept: "工部", profile: "gongbu" },
    { dept: "吏部", profile: "libu_hr" },
  ];

  for (const { dept, profile } of SIX) {
    it(`尚书省输出「部门：${dept}」→ Doing 调用 ${profile}`, async () => {
      const called: string[] = [];
      const { deps, store } = makeDeps({
        runHermes: async (p) => {
          called.push(p);
          if (p === "zhongshu") return "方案：由尚书省派发执行。";
          if (p === "menxia") return "四维审议通过，准奏。";
          if (p === "shangshu") return `部门：${dept}。任务令：完成交付。`;
          return "交付摘要：已完成。";
        },
      });
      await edictIssue(deps, { title: "测试任务" });
      const r = await edictRunPipeline(deps, "JJC-20260827-001");
      expect(r.ok).toBe(true);
      expect(called).toContain(profile);
      // assigneeOrg 持久化 + 看板流转记录「尚书省 → XX部」
      expect(store[0].assigneeOrg).toBe(dept);
      expect(store[0].flow_log.some((f) => f.remark.includes(`派发：尚书省 → ${dept}`))).toBe(true);
    });
  }

  it("下旨指定部门 → 优先派发指定部门（尚书省输出不一致时以指定为准）", async () => {
    const called: string[] = [];
    const { deps, store } = makeDeps({
      runHermes: async (p) => {
        called.push(p);
        if (p === "zhongshu") return "方案：执行。";
        if (p === "menxia") return "准奏。";
        if (p === "shangshu") return "部门：户部。任务令：执行。";
        return "交付摘要：完成。";
      },
    });
    await edictIssue(deps, { title: "测试任务", dept: "兵部" });
    const r = await edictRunPipeline(deps, "JJC-20260827-001");
    expect(r.ok).toBe(true);
    expect(called).toContain("bingbu");
    expect(called).not.toContain("hubu");
    expect(store[0].assigneeOrg).toBe("兵部");
    expect(store[0].flow_log.some((f) => f.remark.includes("（下旨指定）"))).toBe(true);
  });

  it("尚书省未输出部门 → 兜底户部执行且不中断", async () => {
    const called: string[] = [];
    const { deps, store } = makeDeps({
      runHermes: async (p) => {
        called.push(p);
        if (p === "zhongshu") return "方案：执行。";
        if (p === "menxia") return "准奏。";
        if (p === "shangshu") return "任务令：直接执行。";
        return "交付摘要：完成。";
      },
    });
    await edictIssue(deps, { title: "测试任务" });
    const r = await edictRunPipeline(deps, "JJC-20260827-001");
    expect(r.ok).toBe(true);
    expect(called).toContain("hubu");
    expect(store[0].assigneeOrg).toBe("户部");
    expect(store[0].flow_log.some((f) => f.remark.includes("默认户部"))).toBe(true);
  });
});
describe("buildNodePrompt", () => {
  it("中书节点含任务上下文与职责", () => {
    const p = buildNodePrompt("Zhongshu", {
      id: "JJC-20260827-001", title: "调研竞品", description: "输出 5 家分析", state: "Zhongshu",
      flow_log: [], progress_log: [], todos: [],
    });
    expect(p).toContain("JJC-20260827-001");
    expect(p).toContain("调研竞品");
    expect(p).toContain("中书省");
    expect(p).toContain("禁止输出看板命令");
  });
});

describe("官署完整输出落盘（official_outputs）", () => {
  it("appendOfficialOutput 追加完整输出并按时间排序", () => {
    const { deps, store } = makeDeps();
    store.push({
      id: "JJC-20260827-001", title: "测试", state: "Zhongshu", org: "中书省",
      flow_log: [], progress_log: [], todos: [],
      createdAt: "2026-08-27T00:00:00Z", updatedAt: "2026-08-27T00:00:00Z",
    });
    appendOfficialOutput(deps, "JJC-20260827-001", { agent: "zhongshu", agentLabel: "中书省", state: "Zhongshu", output: "完整方案全文（超过 90 字也应该完整保存）" });
    appendOfficialOutput(deps, "JJC-20260827-001", { agent: "hubu", agentLabel: "户部", state: "Doing", output: "![封面](https://cos.example.com/a.png)\nhttps://cos.example.com/v.mp4" });
    expect(store[0].official_outputs).toHaveLength(2);
    expect(store[0].official_outputs?.[0]?.agent).toBe("zhongshu");
    expect(store[0].official_outputs?.[1]?.output).toContain("https://cos.example.com/v.mp4");
    expect(store[0].official_outputs?.[0]?.at).toBeTruthy();
  });

  it("编排完成后每条官署完整输出都落盘（不被 90 字摘要截断）", async () => {
    const { deps, store } = makeDeps({
      runHermes: async (p) => {
        if (p === "zhongshu") return "方案：" + "中".repeat(300);
        if (p === "menxia") return "准奏。";
        if (p === "shangshu") return "户部。任务令：交付数据分析报告。";
        return "交付：" + "文".repeat(500);
      },
    });
    await edictIssue(deps, { title: "测试任务" });
    const r = await edictRunPipeline(deps, "JJC-20260827-001");
    expect(r.ok).toBe(true);
    const task = store.find((t) => t.id === "JJC-20260827-001");
    expect(task?.official_outputs?.length).toBeGreaterThanOrEqual(4);
    // 六部交付完整落盘，不被截断
    const doing = task?.official_outputs?.find((o) => o.state === "Doing");
    expect(doing).toBeTruthy();
    expect(doing?.output).toContain("文".repeat(500));
    expect(task?.output).toContain("文".repeat(500));
    // 中书方案完整落盘
    const zhongshu = task?.official_outputs?.find((o) => o.agent === "zhongshu");
    expect(zhongshu?.output).toContain("中".repeat(300));
  });
});

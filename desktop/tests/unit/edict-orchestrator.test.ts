import {
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
        if (profile === "hubu") return "交付摘要：需求文档已完成。";
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
        if (profile === "hubu") return "交付摘要：完成。";
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

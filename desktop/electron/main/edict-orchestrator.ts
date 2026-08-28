/**
 * 三省六部编排器（主进程，纯逻辑 + 依赖注入，可单测）
 * 职责：看板命令封装（kanban_update.py）+ 状态机校验 + 编排驱动（Hermes CLI 逐节点执行）+ 看板轮询数据源
 * 依赖注入模式仿 hermes-orchestrator.ts；Hermes spawn 由调用方注入（复用 service-manager hermesEnv）。
 */
import { assertTransition, EDICT_STATES, EDICT_STATE_LABEL, type EdictState } from "./edict-state-machine";
import type {
  EdictBoard,
  EdictFlowLogEntry,
  EdictOfficial,
  EdictOp,
  EdictPipelineResult,
  EdictStats,
  EdictTask,
  EdictTodo,
} from "../shared/edict-types";

export type {
  EdictBoard,
  EdictFlowLogEntry,
  EdictOfficial,
  EdictOp,
  EdictPipelineResult,
  EdictStats,
  EdictTask,
  EdictTodo,
};

// ===== 依赖 =====

export interface EdictDeps {
  /** kanban_update.py 调用：返回退出码与输出 */
  spawnKanban: (args: string[], env?: Record<string, string>) => Promise<{ code: number; stdout: string; stderr: string }>;
  /** Hermes CLI 执行：给定 prompt + profile，返回执行文本（失败抛错） */
  runHermes: (profileId: string, prompt: string) => Promise<string>;
  /** 读当前看板任务数组 */
  readBoard: () => EdictTask[];
  /** 看板写入（任务增删改后持久化，返回新数组） */
  writeBoard: (tasks: EdictTask[]) => EdictTask[];
  /** 当前时间戳 */
  now: () => number;
  /** 日志 */
  log?: (msg: string) => void;
  /** 计费回写（best-effort）：编排结束上报 call_log（call_type=orchestrate） */
  reportExecution?: (input: {
    taskId: string;
    status: "completed" | "failed";
    summary: string;
    steps?: unknown[];
    durationMs: number;
  }) => Promise<void>;
  /** 结果回传通知（P5，best-effort）：任务完成/失败/阻塞时推送飞书/企微 webhook */
  notify?: (input: EdictNotifyInput) => Promise<void>;
}

const KANBAN_SCRIPT = "kanban_update.py";
const AGENT_IDS: Record<string, string> = {
  taizi: "taizi", zhongshu: "zhongshu", menxia: "menxia", shangshu: "shangshu",
  libu: "libu", hubu: "hubu", libu_hr: "libu_hr", bingbu: "bingbu",
  xingbu: "xingbu", gongbu: "gongbu", zaochao: "zaochao", qintianjian: "qintianjian",
};

/** 执行部门（中文）→ 六部 profile（照搬 edict task.py ORG_AGENT_MAP） */
export const ORG_AGENT_MAP: Record<string, string> = {
  户部: "hubu",
  礼部: "libu",
  兵部: "bingbu",
  刑部: "xingbu",
  工部: "gongbu",
  吏部: "libu_hr",
};

/** profile id → 中文官署名（产出写回 progress_log 展示用） */
const PROFILE_LABEL: Record<string, string> = {
  zhongshu: "中书省", menxia: "门下省", shangshu: "尚书省",
  libu: "礼部", hubu: "户部", libu_hr: "吏部", bingbu: "兵部",
  xingbu: "刑部", gongbu: "工部", zaochao: "司礼监", qintianjian: "钦天监",
};

export const OFFICIALS: EdictOfficial[] = [
  { id: "taizi", label: "太子", status: "idle", role: "分拣入口（OpenClaw）" },
  { id: "zhongshu", label: "中书省", status: "idle", role: "规划决策" },
  { id: "menxia", label: "门下省", status: "idle", role: "审议把关" },
  { id: "shangshu", label: "尚书省", status: "idle", role: "执行调度" },
  { id: "libu", label: "礼部", status: "idle", role: "内容与礼仪" },
  { id: "hubu", label: "户部", status: "idle", role: "财务与数据" },
  { id: "libu_hr", label: "吏部", status: "idle", role: "人事与组织" },
  { id: "bingbu", label: "兵部", status: "idle", role: "研发攻坚" },
  { id: "xingbu", label: "刑部", status: "idle", role: "质检与审计" },
  { id: "gongbu", label: "工部", status: "idle", role: "工程与运维" },
  { id: "zaochao", label: "司礼监", status: "idle", role: "上朝与要闻" },
  { id: "qintianjian", label: "钦天监", status: "idle", role: "分析与预测" },
];

// ===== 任务 ID 生成（照搬 JJC-YYYYMMDD-NNN） =====

export function nextTaskId(tasks: EdictTask[], now: () => number): string {
  const d = new Date(now());
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const prefix = `JJC-${day}-`;
  let max = 0;
  for (const t of tasks) {
    if (t.id.startsWith(prefix)) {
      const n = Number(t.id.slice(prefix.length));
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return prefix + String(max + 1).padStart(3, "0");
}

// ===== 看板命令封装 =====

async function kanban(deps: EdictDeps, agentId: string, args: string[]): Promise<EdictOp> {
  try {
    const r = await deps.spawnKanban([KANBAN_SCRIPT, ...args], { AGENT_ID: agentId });
    const text = (r.stdout || r.stderr).trim();
    // kanban_update.py 对被拒操作（非法流转/done 被拒/任务不存在）仅打日志且退出码 0，此处按输出识别，避免把被拒当成功
    if (r.code !== 0 || /被拒|被拒绝|不允许|不存在|非法|不在|无权/.test(text)) return { ok: false, error: text || `看板命令失败（退出码 ${r.code}）` };
    deps.log?.(text);
    return { ok: true, data: text };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** 下旨：太子建任务（create → Zhongshu） */
export async function edictIssue(deps: EdictDeps, input: { title: string; body?: string; priority?: string; dept?: string }): Promise<EdictOp<{ taskId: string }>> {
  const tasks = deps.readBoard();
  const taskId = nextTaskId(tasks, deps.now);
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "旨意标题不能为空" };
  const dept = input.dept?.trim();
  const org = dept || "中书省";
  const official = dept ? org : "中书令";
  const remark = input.body?.trim() ? input.body.trim().slice(0, 100) : "太子整理旨意";
  const op = await kanban(deps, "taizi", ["create", taskId, title.slice(0, 80), "Zhongshu", org, official, remark]);
  if (!op.ok) return op;
  // 下旨指定部门 → 持久化 assigneeOrg（kanban create 仅写 org，后续流转会覆盖 org）
  if (dept) {
    deps.writeBoard(deps.readBoard().map((t) => (t.id === taskId ? { ...t, assigneeOrg: dept } : t)));
  }
  return { ok: true, data: { taskId } };
}

/** 状态流转：校验状态机 + 写看板（身份 = 目标官署或调用方指定） */
export async function edictTransition(deps: EdictDeps, taskId: string, to: EdictState, opts: { note?: string; actorAgentId?: string } = {}): Promise<EdictOp> {
  const tasks = deps.readBoard();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: `任务不存在: ${taskId}` };
  const from = task.state as EdictState;
  const check = assertTransition(from, to);
  if (!check.ok) return { ok: false, error: check.reason };
  const agentId = opts.actorAgentId || AGENT_IDS[to] || "taizi";
  return kanban(deps, agentId, ["state", taskId, to, opts.note || `${EDICT_STATE_LABEL[to]}`]);
}

/** 封驳（menxia → Zhongshu，必须带 reason） */
export async function edictVeto(deps: EdictDeps, taskId: string, reason: string): Promise<EdictOp> {
  if (!reason?.trim()) return { ok: false, error: "封驳必须填写原因" };
  const check = await edictTransition(deps, taskId, "Zhongshu", { note: `❌ 封驳：${reason.trim().slice(0, 200)}`, actorAgentId: "menxia" });
  if (!check.ok) return check;
  return kanban(deps, "menxia", ["flow", taskId, "门下省", "中书省", `❌ 封驳：${reason.trim().slice(0, 100)}`]);
}

/** 准奏（menxia → Assigned） */
export async function edictApprove(deps: EdictDeps, taskId: string): Promise<EdictOp> {
  const check = await edictTransition(deps, taskId, "Assigned", { note: "门下省准奏", actorAgentId: "menxia" });
  if (!check.ok) return check;
  return kanban(deps, "menxia", ["flow", taskId, "门下省", "尚书省", "✅ 准奏，转尚书省派发"]);
}

/** 完成（六部 done 收口） */
export async function edictComplete(deps: EdictDeps, taskId: string, output: string, summary: string, actorAgentId?: string): Promise<EdictOp> {
  const task = deps.readBoard().find((t) => t.id === taskId);
  const agentId = actorAgentId || (task?.assigneeOrg ? ORG_AGENT_MAP[task.assigneeOrg] : undefined) || "hubu";
  return kanban(deps, agentId, ["done", taskId, output?.slice(0, 200) || "", summary?.slice(0, 200) || ""]);
}

/** 阻塞/解阻 */
export async function edictBlock(deps: EdictDeps, taskId: string, reason: string, actorAgentId = "zhongshu"): Promise<EdictOp> {
  if (!reason?.trim()) return { ok: false, error: "阻塞必须填写原因" };
  const check = await edictTransition(deps, taskId, "Blocked", { note: `⛔ 阻塞：${reason.trim().slice(0, 200)}`, actorAgentId });
  if (!check.ok) return check;
  return kanban(deps, actorAgentId, ["block", taskId, reason.trim().slice(0, 200)]);
}

/** 进展上报 */
export async function edictProgress(deps: EdictDeps, taskId: string, text: string, plan: string, actorAgentId = "zhongshu"): Promise<EdictOp> {
  return kanban(deps, actorAgentId, ["progress", taskId, text?.slice(0, 200) || "", plan?.slice(0, 300) || ""]);
}

// ===== 看板数据 =====

export function edictBoard(deps: EdictDeps): EdictBoard {
  const tasks = deps.readBoard();
  return {
    tasks: tasks.slice().sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")),
    updatedAt: new Date(deps.now()).toISOString(),
  };
}

export function edictStats(deps: EdictDeps): EdictStats {
  const tasks = deps.readBoard();
  const byState: Record<string, number> = {};
  for (const s of EDICT_STATES) byState[s] = 0;
  let vetoCount = 0;
  for (const t of tasks) {
    byState[t.state] = (byState[t.state] || 0) + 1;
    vetoCount += (t.flow_log || []).filter((f) => f.remark?.startsWith("❌ 封驳")).length;
  }
  const active = tasks.filter((t) => !["Done", "Cancelled"].includes(t.state)).length;
  const done = byState.Done || 0;
  const blocked = byState.Blocked || 0;
  return { total: tasks.length, byState, active, done, blocked, vetoCount, avgDurationMs: 0 };
}

export function edictOfficials(deps: EdictDeps): EdictOfficial[] {
  const tasks = deps.readBoard();
  const busy = new Set<string>();
  for (const t of tasks) {
    if (["Done", "Cancelled"].includes(t.state)) continue;
    const orgMap: Record<string, string> = {
      "中书省": "zhongshu", "门下省": "menxia", "尚书省": "shangshu",
      "礼部": "libu", "户部": "hubu", "吏部": "libu_hr", "兵部": "bingbu",
      "刑部": "xingbu", "工部": "gongbu", "钦天监": "qintianjian", "司礼监": "zaochao",
    };
    // Doing/Next 时 kanban 会把 org 置为"执行中"，按 assigneeOrg 标记对应六部忙闲
    const id = orgMap[t.org || ""] || (t.state === "Doing" || t.state === "Next" ? orgMap[t.assigneeOrg || ""] : undefined);
    if (id) busy.add(id);
  }
  return OFFICIALS.map((o) => ({ ...o, status: busy.has(o.id) ? "busy" : "idle" }));
}

/** 解析执行部门：下旨指定 > 尚书省输出解析 > 兜底户部（对齐原版 assignee_org 派发语义） */
export function resolveExecuteDept(output: string, task: EdictTask): { dept: string; source: "issue" | "shangshu" | "fallback" } {
  const assigned = task.assigneeOrg;
  if (assigned && ORG_AGENT_MAP[assigned]) return { dept: assigned, source: "issue" };
  if (output) {
    for (const d of Object.keys(ORG_AGENT_MAP)) {
      if (output.includes(d)) return { dept: d, source: "shangshu" };
    }
  }
  return { dept: "户部", source: "fallback" };
}

/** 持久化执行部门到 assigneeOrg + 看板流转记录（尚书省 → XX部） */
async function persistAssigneeOrg(deps: EdictDeps, taskId: string, dept: string, source: "issue" | "shangshu" | "fallback"): Promise<EdictOp> {
  const tasks = deps.readBoard();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: `任务不存在: ${taskId}` };
  if (task.assigneeOrg !== dept) {
    deps.writeBoard(tasks.map((t) => (t.id === taskId ? { ...t, assigneeOrg: dept } : t)));
  }
  const fallbackHint = source === "fallback" ? "（尚书省未明确部门，默认户部）" : "";
  return kanban(deps, "shangshu", ["flow", taskId, "尚书省", dept, `${fallbackHint}派发：尚书省 → ${dept}`]);
}

// ===== 编排驱动（顺序执行：Hermes CLI 逐节点 + 看板回写） =====

/** 编排节点顺序：中书起草 → 门下审议（封驳≤3轮）→ 尚书派发 → 六部执行 → 复核 → 完成 */
const PIPELINE: EdictState[] = ["Zhongshu", "Menxia", "Assigned", "Doing", "Review", "Done"];

/** 节点 → 执行 profile（Review/Done 为收口节点，无执行人设） */
const NODE_PROFILE: Partial<Record<EdictState, string>> = {
  Zhongshu: "zhongshu",
  Menxia: "menxia",
  Assigned: "shangshu",
  Doing: "hubu",
};

/** 节点提示词模板（profile 人设由 Hermes profile SOUL.md 承载，此处给任务上下文） */
export function buildNodePrompt(state: EdictState, task: EdictTask, previousOutput?: string, execDept?: string): string {
  const parts: string[] = [];
  parts.push(`任务ID: ${task.id}`);
  parts.push(`旨意标题: ${task.title}`);
  if (task.description) parts.push(`旨意正文: ${task.description}`);
  if (previousOutput) parts.push(`前序产出:
${previousOutput.slice(0, 2000)}`);
  const stage: Record<string, string> = {
    Zhongshu: "你是中书省。请为上述旨意起草简明执行方案（不超过500字）：谁来做、做什么、怎么做、预期产出。只输出方案正文。",
    Menxia: "你是门下省。请按可行性/完整性/风险/资源四个维度审议上述方案。只输出结论行：准奏 或 封驳，若封驳附具体修改建议（每条不超过2句）。",
    Assigned: "你是尚书省。请按领域确定执行部门（工部-工程/兵部-基建安全/户部-数据分析/礼部-文档UI/刑部-审查测试/吏部-人事）并输出任务令。只输出：部门 + 任务令。",
    Doing: execDept ? `你是${execDept}。请按任务令完成交付。只输出：交付摘要 + 关键结果。` : "你是执行部门。请按任务令完成交付。只输出：交付摘要 + 关键结果。",
  };
  parts.push(stage[state] || "请按看板流程推进。");
  parts.push("禁止输出看板命令本身（编排器负责写看板）。");
  return parts.join("\n\n");
}

export interface EdictPipelineRunOptions {
  maxVetoRounds?: number;
}

/**
 * 编排执行：从当前状态开始按 PIPELINE 顺序推进。
 * 每个节点：先跑「当前状态」对应官署 profile（中书/门下/尚书/六部），再按状态机合法流转到下一状态。
 * - 门下：产出含"封驳" → 打回 Zhongshu（最多 maxVetoRounds 轮，超限强制准奏）
 * - 尚书：解析执行部门 → Assigned→Doing 派发
 * - 六部：Doing→Review → Review 走 done 收口
 * 需要人工/无法推进（Blocked 等）时停在当前状态返回。
 */
export async function edictRunPipeline(deps: EdictDeps, taskId: string, opts: EdictPipelineRunOptions = {}): Promise<EdictOp<EdictPipelineResult>> {
  const maxVeto = opts.maxVetoRounds ?? 3;
  const steps: EdictPipelineResult["steps"] = [];
  const startedAt = deps.now();
  let vetoRound = 0;
  let previousOutput: string | undefined;

  // 编排主体：所有 return 统一先落 steps，再走 reportPipelineExecution 收口
  const run = async (): Promise<EdictOp<EdictPipelineResult>> => {
    for (let guard = 0; guard < 20; guard++) {
      const tasks = deps.readBoard();
      const task = tasks.find((t) => t.id === taskId);
      if (!task) return { ok: false, error: `任务不存在: ${taskId}` };
      const state = task.state as EdictState;

      if (state === "Done" || state === "Cancelled") {
        return { ok: true, data: { taskId, finalState: state, steps } };
      }

      const idx = PIPELINE.indexOf(state);
      if (idx < 0) {
        // Blocked / Taizi / Pending 等：等待人工解阻或分拣
        return { ok: true, data: { taskId, finalState: state, steps } };
      }
      const next = PIPELINE[idx + 1];
      if (!next) return { ok: true, data: { taskId, finalState: state, steps } };

      // Doing 节点按任务执行部门动态选六部 profile（尚书省派发或下旨指定；照搬原版 assignee_org 派发语义）
      let profile = NODE_PROFILE[state];
      let execDept: string | undefined;
      if (state === "Doing") {
        execDept = resolveExecuteDept("", task).dept;
        profile = ORG_AGENT_MAP[execDept] || NODE_PROFILE.Doing;
      }
      if (!profile) {
        // 收口节点 Review → Done：看板 done 命令语义=执行部门回报完成→Review，
        // 完成收口必须走 state Done（Review→Done 合法，尚书省复核后收口）
        if (state === "Review") {
          const finish = await edictTransition(deps, taskId, "Done", {
            note: (previousOutput ? previousOutput.slice(0, 100) + " — " : "") + "尚书省复核通过，完成收口",
            actorAgentId: "shangshu",
          });
          if (!finish.ok) return finish;
          // Review→Done 属看板高风险操作，会被拦截进入 PendingConfirm（confirm_by=门下省），需 confirm approve 真正收口
          const confirmOp = await kanban(deps, "menxia", ["confirm", taskId, "approve", "门下省确认完结（尚书省复核通过）"]);
          if (!confirmOp.ok) return confirmOp;
          const flow = await kanban(deps, "shangshu", ["flow", taskId, "尚书省", "完成", "✅ 尚书省复核通过，任务完成"]);
          if (!flow.ok) return flow;
          // 最终产出写回看板 output 字段（UI「产出」区可见；六部交付即最终产出）
          if (previousOutput) {
            const finalOutput = previousOutput.slice(0, 2000);
            try {
              const allTasks = deps.readBoard();
              deps.writeBoard(allTasks.map((t2) => (t2.id === taskId ? { ...t2, output: finalOutput } : t2)));
            } catch (err) {
              deps.log?.(`产出落盘失败: ${(err as Error).message}`);
            }
          }
          continue;
        }
        await edictTransition(deps, taskId, next, {});
        continue;
      }
      // 1) 跑当前节点官署
      const prompt = buildNodePrompt(state, task, previousOutput, execDept);
      let output: string;
      try {
        output = (await deps.runHermes(profile, prompt)).trim();
      } catch (err) {
        const msg = (err as Error).message;
        steps.push({ state, error: msg });
        // 失败原因写回看板 progress_log（UI 可见，不再静默）
        const progErr = await kanban(deps, profile, ["progress", taskId, `❌ ${PROFILE_LABEL[profile] || profile}执行失败：${msg.slice(0, 90)}`]);
        if (!progErr.ok) deps.log?.(`失败回写看板失败: ${progErr.error}`);
        return { ok: false, error: `Hermes 执行失败（${state}）: ${msg}` };
      }
      steps.push({ state, output: output.slice(0, 500) });
      previousOutput = output;
      // 产出写回看板 progress_log（UI「进展」区实时可见该官署回答）
      const progOk = await kanban(deps, profile, ["progress", taskId, `${PROFILE_LABEL[profile] || profile}产出：${output.slice(0, 90)}`]);
      if (!progOk.ok) deps.log?.(`产出回写看板失败（${profile}）: ${progOk.error}`);

      // 2) 按节点规则流转
      if (state === "Menxia") {
        const rework = /封驳/.test(output);
        if (rework && vetoRound < maxVeto) {
          vetoRound += 1;
          const reason = output.split(/封驳/)[1]?.slice(0, 200) || "方案需修改";
          const veto = await edictVeto(deps, taskId, `第${vetoRound}轮封驳：${reason}`);
          if (!veto.ok) return veto;
          continue;
        }
        if (rework && vetoRound >= maxVeto) {
          const approve = await edictApprove(deps, taskId);
          if (!approve.ok) return approve;
          steps.push({ state: "Assigned", output: "封驳超限，第3轮强制准奏" });
          continue;
        }
        const approve = await edictApprove(deps, taskId);
        if (!approve.ok) return approve;
        continue;
      }

      // 尚书省派发：解析执行部门 → 持久化 assigneeOrg + 看板流转记录（尚书省 → XX部）
      if (state === "Assigned") {
        const resolved = resolveExecuteDept(output, task);
        if (resolved.source === "issue") {
          const flow = await kanban(deps, "shangshu", ["flow", taskId, "尚书省", resolved.dept, `派发：尚书省 → ${resolved.dept}（下旨指定）`]);
          if (!flow.ok) return flow;
        } else {
          const persist = await persistAssigneeOrg(deps, taskId, resolved.dept, resolved.source);
          if (!persist.ok) return persist;
        }
      }

      // 其余执行节点：状态机合法流转到下一状态
      const t = await edictTransition(deps, taskId, next, {
        note: state === "Assigned" ? "尚书省派发执行" : state === "Doing" ? "执行完成，待复核" : `${state} → ${next}`,
        // state 命令仅协调署（中书/门下/尚书/太子）有权限；六部执行节点流转由尚书省代写
        actorAgentId: state === "Doing" ? "shangshu" : profile,
      });
      if (!t.ok) return t;
    }
    return { ok: false, error: "编排循环超出保护上限（20 步）" };
  };

  const result = await run();
  await reportPipelineExecution(deps, taskId, result, steps, startedAt);
  return result;
}

/** 编排收口：best-effort 计费回写（call_type=orchestrate），失败不影响主流程 */
async function reportPipelineExecution(
  deps: EdictDeps,
  taskId: string,
  result: EdictOp<EdictPipelineResult>,
  steps: EdictPipelineResult["steps"],
  startedAt: number,
): Promise<void> {
  if (!deps.reportExecution) return;
  try {
    const tasks = deps.readBoard();
    const task = tasks.find((t) => t.id === taskId);
    await deps.reportExecution({
      taskId,
      status: result.ok ? "completed" : "failed",
      summary: task?.title || taskId,
      steps,
      durationMs: Math.max(0, deps.now() - startedAt),
    });
  } catch (err) {
    deps.log?.(`计费回写失败（best-effort）: ${(err as Error).message}`);
  }
  // P5：结果回传通知（best-effort：完成/失败/阻塞/取消 → 飞书/企微 webhook）
  if (deps.notify) {
    try {
      const tasks = deps.readBoard();
      const task = tasks.find((t) => t.id === taskId);
      const finalState = result.ok && result.data?.finalState ? result.data.finalState : ((task?.state as EdictState) ?? "Blocked");
      const status: EdictNotifyInput["status"] =
        finalState === "Done" ? "completed" :
        finalState === "Cancelled" ? "cancelled" :
        finalState === "Blocked" ? "blocked" : "failed";
      await deps.notify({
        taskId,
        title: task?.title || taskId,
        finalState,
        status,
        summary: task?.output ? `产出：${task.output.slice(0, 200)}` : task?.now || "",
        output: task?.output?.slice(0, 500),
        steps,
      });
    } catch (err) {
      deps.log?.(`结果回传通知失败（best-effort）: ${(err as Error).message}`);
    }
  }
}
// ===== P2/P5 补齐：停滞处理 + 人工介入 + 结果回传通知 =====

/** 结果回传通知载荷 */
export interface EdictNotifyInput {
  taskId: string;
  title: string;
  finalState: EdictState;
  status: "completed" | "failed" | "blocked" | "cancelled";
  summary?: string;
  output?: string;
  steps?: EdictPipelineResult["steps"];
}

/** 追加看板流转日志（原子：读-追加-写） */
export function appendFlowLog(deps: EdictDeps, taskId: string, entry: Omit<EdictFlowLogEntry, "at">): EdictOp {
  const tasks = deps.readBoard();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return { ok: false, error: `任务不存在: ${taskId}` };
  const flow_log = [...(task.flow_log || []), { at: new Date(deps.now()).toISOString(), ...entry }];
  deps.writeBoard(tasks.map((t) => (t.id === taskId ? { ...t, flow_log } : t)));
  return { ok: true };
}

/** 停滞元信息（meta 持久化，参考 orchestrator_worker 的 stall_count/escalation_level） */
export function stallMetaOf(task: EdictTask): { stallCount: number; escalationLevel: number } {
  const m = (task.meta || {}) as Record<string, unknown>;
  const toNum = (v: unknown): number => (typeof v === "number" ? v : Number(v || 0));
  return { stallCount: toNum(m.stall_count), escalationLevel: toNum(m.escalation_level) };
}

/** 停滞判定：非终态编排状态且超过阈值未更新（照搬 orchestrator_worker 阈值语义） */
export function isStalledTask(task: EdictTask, now: number, thresholdMs: number): boolean {
  if (["Done", "Cancelled", "Blocked", "Pending"].includes(task.state)) return false;
  const last = task.updatedAt || task.createdAt || "";
  if (!last) return false;
  const t = new Date(last).getTime();
  if (Number.isNaN(t)) return false;
  return now - t >= thresholdMs;
}

/** 停滞升级一步（适配本地状态机：Menxia→Zhongshu / Review→Menxia / PendingConfirm→Review；其余执行态无合法回退 → Blocked 人工介入） */
export async function escalateOneLevel(deps: EdictDeps, taskId: string): Promise<EdictOp> {
  const task = deps.readBoard().find((t) => t.id === taskId);
  if (!task) return { ok: false, error: `任务不存在: ${taskId}` };
  const state = task.state as EdictState;
  const level = stallMetaOf(task).escalationLevel + 1;
  // 先记升级层级（meta），再走状态机
  {
    const tasks = deps.readBoard();
    const cur = tasks.find((t) => t.id === taskId);
    if (cur) {
      const meta = { ...(cur.meta || {}), escalation_level: level };
      deps.writeBoard(tasks.map((t) => (t.id === taskId ? { ...t, meta } : t)));
    }
  }
  const after = async (r: EdictOp, from: EdictState, to: EdictState, label: string): Promise<EdictOp> => {
    if (r.ok) await appendFlowLog(deps, taskId, { from, to, remark: `⬆️ 停滞升级：${label}`, agent: "shangshu", agentLabel: "尚书省" });
    return r;
  };
  switch (state) {
    case "Menxia":
      return after(await edictTransition(deps, taskId, "Zhongshu", { note: "⬆️ 停滞升级：门下省 → 中书省重拟", actorAgentId: "menxia" }), "Menxia", "Zhongshu", "门下省 → 中书省重拟");
    case "Review":
      return after(await edictTransition(deps, taskId, "Menxia", { note: "⬆️ 停滞升级：待复核 → 退回门下省重审", actorAgentId: "shangshu" }), "Review", "Menxia", "待复核 → 退回门下省重审");
    case "PendingConfirm":
      return after(await edictTransition(deps, taskId, "Review", { note: "⬆️ 停滞升级：待回奏确认 → 退回复核", actorAgentId: "shangshu" }), "PendingConfirm", "Review", "待回奏确认 → 退回复核");
    case "Taizi":
      // 太子分拣停滞：推进到中书省起草（Taizi→Blocked 非法）
      return after(await edictTransition(deps, taskId, "Zhongshu", { note: "⬆️ 停滞升级：太子分拣停滞 → 转中书省起草", actorAgentId: "taizi" }), "Taizi", "Zhongshu", "太子分拣停滞 → 转中书省起草");
    case "Zhongshu":
    case "Assigned":
    case "Next":
    case "Doing":
    default:
      return edictBlock(deps, taskId, `停滞升级（第${level}级）：${EDICT_STATE_LABEL[state] || state} 长时间无进展，转人工介入`);
  }
}

/** 手动介入：取消任务 */
export async function edictCancel(deps: EdictDeps, taskId: string): Promise<EdictOp> {
  return edictTransition(deps, taskId, "Cancelled", { note: "🙅 皇上传旨取消", actorAgentId: "taizi" });
}

/** 手动介入：推进到下一合法状态 */
export async function edictAdvance(deps: EdictDeps, taskId: string): Promise<EdictOp> {
  const task = deps.readBoard().find((t) => t.id === taskId);
  if (!task) return { ok: false, error: `任务不存在: ${taskId}` };
  const from = task.state as EdictState;
  const order: EdictState[] = ["Pending", "Taizi", "Zhongshu", "Menxia", "Assigned", "Next", "Doing", "Review", "Done"];
  const idx = order.indexOf(from);
  for (let i = idx + 1; i < order.length; i++) {
    const to = order[i];
    if (assertTransition(from, to).ok) {
      const r = await edictTransition(deps, taskId, to, { note: `👆 人工推进：${EDICT_STATE_LABEL[from]} → ${EDICT_STATE_LABEL[to]}` });
      if (r.ok) await appendFlowLog(deps, taskId, { from, to, remark: `👆 人工推进：${EDICT_STATE_LABEL[from]} → ${EDICT_STATE_LABEL[to]}`, agent: "taizi", agentLabel: "太子" });
      return r;
    }
  }
  return { ok: false, error: `任务 ${from} 无合法下一状态（可能已是终态或需先解阻）` };
}

/** 手动介入：解阻（Blocked → Zhongshu 重新起草，随后可重新编排） */
export async function edictUnblock(deps: EdictDeps, taskId: string): Promise<EdictOp> {
  const task = deps.readBoard().find((t) => t.id === taskId);
  if (!task) return { ok: false, error: `任务不存在: ${taskId}` };
  if (task.state !== "Blocked") return { ok: false, error: `仅阻塞任务可解阻（当前 ${task.state}）` };
  const r = await edictTransition(deps, taskId, "Zhongshu", { note: "✅ 解阻：中书省重新起草", actorAgentId: "taizi" });
  if (r.ok) await appendFlowLog(deps, taskId, { from: "Blocked", to: "Zhongshu", remark: "✅ 解阻：中书省重新起草", agent: "taizi", agentLabel: "太子" });
  return r;
}

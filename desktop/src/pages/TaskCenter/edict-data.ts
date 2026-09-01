/**
 * 三省六部 + 军机处 — 渲染层数据适配
 * 真实数据经 IPC（src/api/edict-api.ts）获取；类型以 electron/shared/edict-types.ts 为权威
 * （12 态状态机照搬 edict kanban/task.py，列映射镜像 edict-state-machine EDICT_COLUMN）。
 */
import type {
  EdictState,
  EdictTask as BoardTask,
  EdictFlowLogEntry,
  EdictOfficial,
  EdictOfficialOutput,
  EdictTodo,
} from "@shared/edict-types";

export type { EdictState };
export type { EdictFlowLogEntry, EdictTodo, EdictOfficial };

/** 看板列（12 态 → 9 列） */
export interface EdictColumnDef {
  key: string;
  title: string;
  icon: string;
  tone: "royal" | "audit" | "exec" | "done" | "plain";
  states: EdictState[];
}

export const EDICT_COLUMNS: EdictColumnDef[] = [
  { key: "pending",  title: "待处理", icon: "📥", tone: "plain", states: ["Pending"] },
  { key: "taizi",    title: "太子",   icon: "👑", tone: "royal", states: ["Taizi"] },
  { key: "zhongshu", title: "中书省", icon: "📝", tone: "royal", states: ["Zhongshu"] },
  { key: "menxia",   title: "门下省", icon: "🛡", tone: "audit", states: ["Menxia"] },
  { key: "shangshu", title: "尚书省", icon: "🏛", tone: "royal", states: ["Assigned", "Next"] },
  { key: "doing",    title: "六部执行", icon: "👥", tone: "exec", states: ["Doing"] },
  { key: "review",   title: "复核",   icon: "🔍", tone: "audit", states: ["Review", "PendingConfirm"] },
  { key: "done",     title: "回奏",   icon: "✅", tone: "done",  states: ["Done", "Cancelled"] },
  { key: "blocked",  title: "阻塞",   icon: "⛔", tone: "plain", states: ["Blocked"] },
];

/** 12 态 → 列 key（镜像 edict-state-machine EDICT_COLUMN） */
const STATE_COLUMN: Record<EdictState, string> = {
  Pending: "pending",
  Taizi: "taizi",
  Zhongshu: "zhongshu",
  Menxia: "menxia",
  Assigned: "shangshu",
  Next: "shangshu",
  Doing: "doing",
  Review: "review",
  Done: "done",
  Blocked: "blocked",
  Cancelled: "done",
  PendingConfirm: "review",
};

/** 状态中文标签（镜像 edict-state-machine EDICT_STATE_LABEL） */
export const EDICT_STATE_LABEL: Record<EdictState, string> = {
  Pending: "待处理", Taizi: "太子分拣", Zhongshu: "中书起草", Menxia: "门下审议",
  Assigned: "已派发", Next: "待执行", Doing: "执行中", Review: "待复核",
  Done: "已完成", Blocked: "阻塞", Cancelled: "已取消", PendingConfirm: "待回奏确认",
};

export function stateColumnKey(state: EdictState): string {
  return STATE_COLUMN[state] || "pending";
}

/* ===== 官署元数据（emoji/颜色静态，状态实时） ===== */

export type OfficialStatus = "idle" | "work" | "deep" | "offline";

export interface OfficialMeta {
  id: string;      // Hermes profile id
  name: string;    // 官署名
  role: string;    // 职责
  emoji: string;
  color: string;
  model?: string;  // 模型展示（Hermes 联调后生效）
}

export const OFFICIAL_META: OfficialMeta[] = [
  { id: "taizi",    name: "太子",   role: "分拣 · 入口（OpenClaw）", emoji: "👑", color: "#d4a017" },
  { id: "zhongshu", name: "中书省", role: "规划拆解",                emoji: "📝", color: "#d4a017" },
  { id: "menxia",   name: "门下省", role: "审议封驳",                emoji: "🛡", color: "#8b5cf6" },
  { id: "shangshu", name: "尚书省", role: "派发汇总",                emoji: "🏛", color: "#d4a017" },
  { id: "libu",     name: "礼部",   role: "内容 · 礼制",             emoji: "🎎", color: "#8b5cf6" },
  { id: "hubu",     name: "户部",   role: "财务 · 计费",             emoji: "💰", color: "#16a34a" },
  { id: "libu_hr",  name: "吏部",   role: "人事 · 任务编排",         emoji: "🎓", color: "#1677ff" },
  { id: "bingbu",   name: "兵部",   role: "研发攻坚",                emoji: "⚔", color: "#1677ff" },
  { id: "xingbu",   name: "刑部",   role: "质检 · 审计",             emoji: "⚖", color: "#dc2626" },
  { id: "gongbu",   name: "工部",   role: "工程 · 运维",             emoji: "🔧", color: "#0ea5e9" },
  { id: "zaochao",  name: "司礼监", role: "上朝 · 要闻",             emoji: "🎎", color: "#d4a017" },
  { id: "qintianjian", name: "钦天监", role: "分析 · 预测",          emoji: "🔭", color: "#0ea5e9" },
];

export const OFFICIALS_COUNT = OFFICIAL_META.length;

/** 军机处官员卡片（元数据 + 实时状态/计数） */
export interface OfficialCard extends OfficialMeta {
  status: OfficialStatus;
  statusText: string;
  todayCompleted: number;
  todoCount: number;
}

/** 官署名（org）→ 官署 id（与 orchestrator edictOfficials orgMap 对齐） */
const ORG_TO_ID: Record<string, string> = {
  中书省: "zhongshu", 门下省: "menxia", 尚书省: "shangshu",
  礼部: "libu", 户部: "hubu", 吏部: "libu_hr", 兵部: "bingbu",
  刑部: "xingbu", 工部: "gongbu", 钦天监: "qintianjian", 司礼监: "zaochao",
};

export function orgToId(org: string): string {
  return ORG_TO_ID[org] || "";
}

/** 官署名（official 职称）→ 官署 id */
function officialToId(official: string): string {
  for (const [org, id] of Object.entries(ORG_TO_ID)) {
    if (official.includes(org) || org.includes(official)) return id;
  }
  const byLabel: Record<string, string> = {
    太子: "taizi", 中书令: "zhongshu", 侍中: "menxia", 尚书令: "shangshu",
    礼部尚书: "libu", 户部尚书: "hubu", 吏部尚书: "libu_hr", 兵部尚书: "bingbu",
    刑部尚书: "xingbu", 工部尚书: "gongbu", 钦天监: "qintianjian", 司礼监: "zaochao",
  };
  return byLabel[official] || "";
}

/** 由看板任务构建官员卡片（真实状态 + 待办/完成计数） */
export function buildOfficialCards(officials: EdictOfficial[], tasks: BoardTask[]): OfficialCard[] {
  const todoById = new Map<string, number>();
  const doneById = new Map<string, number>();
  for (const t of tasks) {
    const id = orgToId(t.org || "") || officialToId(t.official || "");
    if (!id) continue;
    if (t.state === "Done") doneById.set(id, (doneById.get(id) || 0) + 1);
    else todoById.set(id, (todoById.get(id) || 0) + 1);
  }
  return OFFICIAL_META.map((m) => {
    const real = officials.find((o) => o.id === m.id);
    const status: OfficialStatus = real?.status === "busy" ? "work" : "idle";
    return {
      ...m,
      status,
      statusText: status === "work" ? "忙碌" : "空闲",
      todayCompleted: doneById.get(m.id) || 0,
      todoCount: todoById.get(m.id) || 0,
    };
  });
}

/* ===== 军机处统计（真实看板派生） ===== */

export interface JunjiStats {
  issuedToday: number;
  executing: number;
  doneToday: number;
  rejected: number;
  byState: Record<string, number>;
  avgMinutes: number;
}

function isToday(v?: string): boolean {
  if (!v) return false;
  const d = new Date(v);
  return !isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}

export function buildJunjiStats(tasks: BoardTask[]): JunjiStats {
  const issuedToday = tasks.filter((t) => isToday(t.createdAt || t.updatedAt)).length;
  const executing = tasks.filter((t) => !["Done", "Cancelled"].includes(t.state)).length;
  const doneToday = tasks.filter((t) => t.state === "Done" && isToday(t.updatedAt || t.createdAt)).length;
  const rejected = tasks.reduce(
    (n, t) => n + (t.flow_log || []).filter((f) => f.remark?.includes("封驳")).length,
    0,
  );
  const byState: Record<string, number> = {};
  for (const t of tasks) byState[t.state] = (byState[t.state] || 0) + 1;
  const doneTasks = tasks.filter((t) => t.state === "Done" && t.createdAt && t.updatedAt);
  const avgMinutes = doneTasks.length
    ? Math.round(
        doneTasks.reduce((s, t) => s + (new Date(t.updatedAt as string).getTime() - new Date(t.createdAt as string).getTime()) / 60000, 0) /
          doneTasks.length,
      )
    : 0;
  return { issuedToday, executing, doneToday, rejected, byState, avgMinutes };
}

/* ===== 天下要闻（看板 flow_log 派生） ===== */

export interface NewsItem {
  time: string;
  dept: string;
  action: string;
  target?: string;
  tone?: "ok" | "reject" | "normal";
}

function fmtTime(at: string): string {
  const d = new Date(at);
  if (isNaN(d.getTime())) return at;
  return d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

export function buildNews(tasks: BoardTask[], limit = 8): NewsItem[] {
  const events: { at: string; from: string; remark: string }[] = [];
  for (const t of tasks) {
    for (const f of t.flow_log || []) {
      if (!f.at) continue;
      events.push({ at: f.at, from: f.from || "", remark: f.remark || f.to || "" });
    }
  }
  events.sort((a, b) => b.at.localeCompare(a.at));
  return events.slice(0, limit).map((e) => ({
    time: fmtTime(e.at),
    dept: e.from || "朝廷",
    action: e.remark,
    tone: e.remark.includes("封驳") ? "reject" : /准奏|通过|完成|回奏|✅/.test(e.remark) ? "ok" : "normal",
  }));
}

/* ===== 任务适配（BoardTask → UI 卡片） ===== */

export interface UiEdictTask {
  id: string;
  title: string;
  desc?: string;
  state: EdictState;
  level: "heavy" | "light";
  priority: string;
  assignee: string;   // 展示名（官署）
  org?: string;
  official?: string;
  dept?: string;      // 六部名（org 以“部”结尾）
  createdAt: string;
  updatedAt: string;
  block?: string;
  output?: string;
  rejected: boolean;
  rejectReason?: string;
  flowLog: EdictFlowLogEntry[];
  progressLog: { at: string; agent: string; agentLabel?: string; text: string; todos?: string[] }[];
  todos: EdictTodo[];
  /** 官署完整输出（详情抽屉/回奏展示） */
  officialOutputs: EdictOfficialOutput[];
}

export function toUiTask(t: BoardTask): UiEdictTask {
  const org = t.org || "";
  // 执行部门优先取 assigneeOrg（Doing/Next 时 kanban 会把 org 置为"执行中"，部门只存在于 assigneeOrg）
  const assigneeOrg = t.assigneeOrg || "";
  const priority = t.priority || "medium";
  const rejectedEntries = (t.flow_log || []).filter((f) => f.remark?.includes("封驳"));
  const lastReject = rejectedEntries[rejectedEntries.length - 1];
  return {
    id: t.id,
    title: t.title,
    desc: t.description,
    state: t.state as EdictState,
    level: priority === "high" ? "heavy" : "light",
    priority,
    assignee: assigneeOrg || org || t.official || "太子",
    org,
    official: t.official,
    dept: assigneeOrg || (/部$/.test(org) ? org : undefined),
    createdAt: t.createdAt || t.updatedAt || "",
    updatedAt: t.updatedAt || t.createdAt || "",
    block: t.block,
    output: t.output,
    rejected: rejectedEntries.length > 0,
    rejectReason: lastReject ? lastReject.remark : undefined,
    flowLog: t.flow_log || [],
    progressLog: t.progress_log || [],
    todos: t.todos || [],
    officialOutputs: t.official_outputs || [],
  };
}

export const DEPT_AVATAR: Record<string, string> = {
  户部: "户", 兵部: "兵", 工部: "工", 礼部: "礼", 刑部: "刑", 吏部: "吏",
};

export function formatRelativeTime(v: string): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return min + " 分钟前";
  const hr = Math.floor(min / 60);
  if (hr < 24) return hr + " 小时前";
  return d.toLocaleDateString("zh-CN");
}

export function priorityLabel(p: string): string {
  if (p === "high") return "高";
  if (p === "low") return "低";
  return "中";
}

/**
 * 三省六部状态机 — 照搬 edict task.py 的 STATE_TRANSITIONS（单一事实源）
 * 12 态：Pending/Taizi/Zhongshu/Menxia/Assigned/Next/Doing/Review/Done/Blocked/Cancelled/PendingConfirm
 * 用于前端防呆与 orchestrator 编排合法性校验（edict kanban_update.py 内部亦独立校验）。
 */
import type { EdictState } from "../shared/edict-types";
import { EDICT_STATES } from "../shared/edict-types";

export type { EdictState };
export { EDICT_STATES };

export const TERMINAL_STATES = new Set<EdictState>(["Done", "Cancelled"]);

/** 权威流转表（照搬 task.py STATE_TRANSITIONS） */
export const STATE_TRANSITIONS: Record<EdictState, EdictState[]> = {
  Pending: ["Taizi", "Cancelled"],
  Taizi: ["Zhongshu", "Cancelled"],
  Zhongshu: ["Menxia", "Cancelled", "Blocked"],
  Menxia: ["Assigned", "Zhongshu", "Cancelled"],
  Assigned: ["Doing", "Next", "Cancelled", "Blocked"],
  Next: ["Doing", "Cancelled", "Blocked"],
  Doing: ["Review", "Done", "Blocked", "Cancelled"],
  Review: ["Done", "Menxia", "Doing", "Cancelled", "PendingConfirm"],
  PendingConfirm: ["Done", "Review", "Cancelled"],
  Blocked: ["Taizi", "Zhongshu", "Menxia", "Assigned", "Next", "Doing", "Review", "Cancelled"],
  Done: [],
  Cancelled: [],
};

/** 校验状态转换是否合法；非法返回原因 */
export function assertTransition(from: EdictState, to: EdictState): { ok: true } | { ok: false; reason: string } {
  if (!EDICT_STATES.includes(from)) return { ok: false, reason: `未知来源状态: ${from}` };
  if (!EDICT_STATES.includes(to)) return { ok: false, reason: `未知目标状态: ${to}` };
  if (from === to) return { ok: false, reason: `状态未变化: ${from}` };
  const allowed = STATE_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `非法状态转换: ${from} → ${to}（允许: ${allowed.join(" / ") || "无，终态"}）` };
  }
  return { ok: true };
}

/** 是否终态 */
export function isTerminal(state: EdictState): boolean {
  return TERMINAL_STATES.has(state);
}

/** 前端列映射（UI 8 列 + 完成区） */
export const EDICT_COLUMN: Record<EdictState, string> = {
  Pending: "inbox",
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

/** 中文状态标签（展示层） */
export const EDICT_STATE_LABEL: Record<EdictState, string> = {
  Pending: "待处理", Taizi: "太子分拣", Zhongshu: "中书起草", Menxia: "门下审议",
  Assigned: "已派发", Next: "待执行", Doing: "执行中", Review: "待复核",
  Done: "已完成", Blocked: "阻塞", Cancelled: "已取消", PendingConfirm: "待回奏确认",
};

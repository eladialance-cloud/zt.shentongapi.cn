import {
  assertTransition,
  isTerminal,
  EDICT_COLUMN,
  EDICT_STATE_LABEL,
  STATE_TRANSITIONS,
  type EdictState,
} from "../../electron/main/edict-state-machine";

/** 全路径（每个状态的每个合法目标）照搬 task.py STATE_TRANSITIONS */
describe("assertTransition（照搬 task.py 权威流转表）", () => {
  it("合法流转全部放行", () => {
    const cases: [EdictState, EdictState][] = [
      ["Pending", "Taizi"], ["Pending", "Cancelled"],
      ["Taizi", "Zhongshu"], ["Taizi", "Cancelled"],
      ["Zhongshu", "Menxia"], ["Zhongshu", "Cancelled"], ["Zhongshu", "Blocked"],
      ["Menxia", "Assigned"], ["Menxia", "Zhongshu"], ["Menxia", "Cancelled"],
      ["Assigned", "Doing"], ["Assigned", "Next"], ["Assigned", "Cancelled"], ["Assigned", "Blocked"],
      ["Next", "Doing"], ["Next", "Cancelled"], ["Next", "Blocked"],
      ["Doing", "Review"], ["Doing", "Done"], ["Doing", "Blocked"], ["Doing", "Cancelled"],
      ["Review", "Done"], ["Review", "Menxia"], ["Review", "Doing"], ["Review", "Cancelled"], ["Review", "PendingConfirm"],
      ["PendingConfirm", "Done"], ["PendingConfirm", "Review"], ["PendingConfirm", "Cancelled"],
      ["Blocked", "Taizi"], ["Blocked", "Zhongshu"], ["Blocked", "Menxia"],
      ["Blocked", "Assigned"], ["Blocked", "Next"], ["Blocked", "Doing"], ["Blocked", "Review"], ["Blocked", "Cancelled"],
    ];
    for (const [from, to] of cases) {
      expect(assertTransition(from, to)).toEqual({ ok: true });
    }
  });

  it("非法流转全部拒绝", () => {
    const cases: [EdictState, EdictState][] = [
      ["Pending", "Zhongshu"], ["Pending", "Done"],
      ["Taizi", "Menxia"], ["Taizi", "Done"],
      ["Zhongshu", "Assigned"], ["Zhongshu", "Done"],
      ["Menxia", "Doing"], ["Menxia", "Done"],
      ["Assigned", "Review"], ["Assigned", "Done"],
      ["Next", "Review"], ["Next", "Done"],
      ["Doing", "Menxia"], ["Doing", "PendingConfirm"],
      ["Review", "Taizi"], ["Review", "Assigned"],
      ["PendingConfirm", "Menxia"], ["PendingConfirm", "Assigned"],
      ["Blocked", "Done"],
    ];
    for (const [from, to] of cases) {
      const r = assertTransition(from, to);
      expect(r.ok).toBe(false);
      expect(r.ok === false ? r.reason : "").toContain("非法状态转换");
    }
  });

  it("未知状态 / 状态未变化", () => {
    expect(assertTransition("X" as EdictState, "Done").ok).toBe(false);
    expect(assertTransition("Done", "Y" as EdictState).ok).toBe(false);
    expect(assertTransition("Done", "Done").ok).toBe(false);
  });

  it("终态无出口", () => {
    expect(STATE_TRANSITIONS.Done).toEqual([]);
    expect(STATE_TRANSITIONS.Cancelled).toEqual([]);
    expect(isTerminal("Done")).toBe(true);
    expect(isTerminal("Cancelled")).toBe(true);
    expect(isTerminal("Doing")).toBe(false);
  });
});

describe("EDICT_COLUMN / EDICT_STATE_LABEL", () => {
  it("12 态全映射", () => {
    expect(Object.keys(EDICT_COLUMN)).toHaveLength(12);
    expect(Object.keys(EDICT_STATE_LABEL)).toHaveLength(12);
    expect(EDICT_COLUMN.Zhongshu).toBe("zhongshu");
    expect(EDICT_COLUMN.Done).toBe("done");
    expect(EDICT_STATE_LABEL.Menxia).toBe("门下审议");
  });
});

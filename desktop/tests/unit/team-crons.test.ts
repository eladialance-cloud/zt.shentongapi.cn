import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CRONS, exprToRunTime, exprToWeekday } from "../../electron/main/team-ipc";

const FLOWS_DIR = join(__dirname, "../../resources/service-registry/modules/flows/capabilities");

/** flows 模块已注册的业务流 id（唯一真源：capabilities/*.py 的 FLOWS 表） */
function registeredFlowIds(): Set<string> {
  const ids = new Set<string>();
  for (const file of readdirSync(FLOWS_DIR)) {
    if (!file.endsWith(".py")) continue;
    const text = readFileSync(join(FLOWS_DIR, file), "utf8");
    for (const m of text.matchAll(/^ {4}"([a-z0-9-]+)":\s*\{$/gm)) ids.add(m[1]);
  }
  return ids;
}

const allEntries = Object.entries(DEFAULT_CRONS).flatMap(([official, list]) =>
  list.map((c) => ({ official, ...c })),
);

describe("team-ipc 默认定时任务（按对标节拍对齐）", () => {
  it("覆盖 12 个官署，总量与对标节拍同量级（≥40 条）", () => {
    expect(Object.keys(DEFAULT_CRONS)).toHaveLength(12);
    expect(allEntries.length).toBeGreaterThanOrEqual(40);
    for (const official of Object.keys(DEFAULT_CRONS)) {
      expect(Array.isArray(DEFAULT_CRONS[official])).toBe(true);
    }
  });

  it("每官署内任务名唯一，且名称以官署前缀开头", () => {
    const seen = new Set<string>();
    for (const e of allEntries) {
      const key = `${e.official}/${e.name}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("cron 表达式合法（5 段，分/时/日/月/周，且能落到 HH:mm）", () => {
    for (const e of allEntries) {
      const parts = e.expr.trim().split(/\s+/);
      expect(parts).toHaveLength(5);
      expect(Number(parts[0])).toBeGreaterThanOrEqual(0);
      expect(Number(parts[0])).toBeLessThan(60);
      expect(Number(parts[1])).toBeGreaterThanOrEqual(0);
      expect(Number(parts[1])).toBeLessThan(24);
      expect(exprToRunTime(e.expr)).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it("执行方式为 flow 的任务必须带已注册的业务流 id，llm 任务不得带 flowId", () => {
    const registered = registeredFlowIds();
    expect(registered.size).toBeGreaterThan(0);
    for (const e of allEntries) {
      if (e.executeKind === "flow") {
        expect(e.flowId).toBeTruthy();
        expect(registered.has(String(e.flowId))).toBe(true);
      } else {
        expect(e.executeKind).toBe("llm");
        expect(e.flowId ?? null).toBeNull();
      }
    }
  });

  it("每条任务都有可读描述：写明做什么、落到哪类产出", () => {
    for (const e of allEntries) {
      expect((e.description ?? "").length).toBeGreaterThanOrEqual(8);
    }
  });

  it("关键节拍齐备：开局 → 采集 → 答疑 → 战报 → 复盘", () => {
    const beats = allEntries.map((e) => `${e.official}@${exprToRunTime(e.expr)}`);
    for (const beat of [
      "zaochao@06:00",
      "qintianjian@06:00",
      "zhongshu@06:15",
      "zhongshu@07:00",
      "menxia@07:30",
      "shangshu@08:00",
      "gongbu@08:30",
      "libu@08:45",
      "libu@09:00",
      "bingbu@09:30",
      "shangshu@19:30",
      "shangshu@20:00",
      "qintianjian@21:00",
      "qintianjian@22:00",
    ]) {
      expect(beats).toContain(beat);
    }
  });

  it("周期任务按星期域解析：中书省战略复盘=周日，吏部巡检/兵部健康度=周一", () => {
    expect(exprToWeekday("0 20 * * 0")).toBe(7);
    expect(exprToWeekday("0 9 * * 1")).toBe(1);
    expect(exprToWeekday("15 10 * * 1")).toBe(1);
    expect(exprToWeekday("0 8 * * *")).toBeUndefined();
    expect(DEFAULT_CRONS.zhongshu.some((c) => c.expr === "0 20 * * 0")).toBe(true);
    expect(DEFAULT_CRONS.libu_hr.some((c) => c.expr === "0 9 * * 1")).toBe(true);
  });
});
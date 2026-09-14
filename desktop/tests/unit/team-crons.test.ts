import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_CRONS,
  createOfficialCrons,
  exprToRunTime,
  exprToWeekday,
  type TeamIpcDeps,
} from "../../electron/main/team-ipc";

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

// ===== 幂等与自愈：重跑「一键组队」不再把定时任务翻倍 =====

const wrap = (data: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve({ code: 0, data }) });

/** 造只覆盖 createOfficialCrons 所需依赖的假 deps；bare=true 时 GET 直接返回裸数组 */
function mkDeps(existing: Array<Record<string, unknown>>, token: string | null = "jwt", bare = false) {
  const posts: Array<Record<string, unknown>> = [];
  const deletes: string[] = [];
  const patches: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    if (u.endsWith("/scheduled-tasks") && method === "GET") {
      const body = bare ? existing : { code: 0, data: existing };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }
    if (u.endsWith("/scheduled-tasks") && method === "POST") {
      posts.push(JSON.parse(String(init?.body)));
      return Promise.resolve(wrap({ id: 9000 + posts.length }));
    }
    if (method === "PATCH") {
      patches.push({ url: u, body: JSON.parse(String(init?.body)) });
      return Promise.resolve(wrap({ ok: true }));
    }
    if (method === "DELETE") {
      deletes.push(u);
      return Promise.resolve(wrap({ ok: true }));
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  });
  const deps = {
    stApiBase: "https://example.test/api",
    getAuthToken: () => token,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  } as unknown as TeamIpcDeps;
  return { deps, posts, deletes, patches, fetchImpl };
}

/**
 * 后端已存在行的形态（与 GET /scheduled-tasks 返回一致）。
 * repeat 默认 "daily"：2.1.6 及更早把周任务也建成了 daily（历史漂移的真实形态）。
 */
function row(official: string, c: { name: string; expr: string }, id = 1, repeat: "daily" | "weekly" = "daily") {
  return {
    id,
    title: c.name,
    agentId: official,
    runTime: exprToRunTime(c.expr),
    weekday: exprToWeekday(c.expr) ?? null,
    repeatType: repeat,
  };
}

describe("createOfficialCrons 幂等与自愈（重跑一键组队不再翻倍）", () => {
  const official = "taizi";
  const list = DEFAULT_CRONS[official];

  it("空库：逐条新建，created=任务数，skipped/deduped=0", async () => {
    const { deps, posts, deletes } = mkDeps([]);
    const r = await createOfficialCrons(deps, official);
    expect(r).toEqual({ ok: true, created: list.length, skipped: 0, deduped: 0, fixed: 0 });
    expect(posts).toHaveLength(list.length);
    expect(posts[0]).toMatchObject({
      agentId: official,
      title: list[0].name,
      repeatType: "daily",
      runTime: exprToRunTime(list[0].expr),
    });
    expect(deletes).toHaveLength(0);
  });

  it("重跑：已全部存在 → 一条不建、全部跳过（防翻倍）", async () => {
    const { deps, posts, deletes } = mkDeps(list.map((c, i) => row(official, c, i + 1)));
    const r = await createOfficialCrons(deps, official);
    expect(r).toEqual({ ok: true, created: 0, skipped: list.length, deduped: 0, fixed: 0 });
    expect(posts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it("部分缺失：只补缺的那条，其余跳过", async () => {
    const { deps, posts } = mkDeps([row(official, list[1], 5)]);
    const r = await createOfficialCrons(deps, official);
    expect(r.created).toBe(list.length - 1);
    expect(r.skipped).toBe(1);
    expect(posts.map((p) => p.title)).not.toContain(list[1].name);
  });

  it("自愈历史重复：同四要素 3 条 → 保留 id 最小，删掉其余 2 条", async () => {
    const dup = [row(official, list[0], 30), row(official, list[0], 11), row(official, list[0], 22)];
    const { deps, posts, deletes } = mkDeps([
      ...dup,
      ...list.slice(1).map((c, i) => row(official, c, 100 + i)),
    ]);
    const r = await createOfficialCrons(deps, official);
    expect(r).toEqual({ ok: true, created: 0, skipped: list.length, deduped: 2, fixed: 0 });
    expect(posts).toHaveLength(0);
    expect(deletes.sort()).toEqual([
      "https://example.test/api/scheduled-tasks/22",
      "https://example.test/api/scheduled-tasks/30",
    ]);
  });

  it("周任务建为 weekly（否则周日战略复盘会被天天跑）", async () => {
    const weekly = { name: "中书省·战略复盘迭代", expr: "0 20 * * 0" };
    const { deps, posts } = mkDeps([], "jwt");
    await createOfficialCrons(deps, "zhongshu");
    const weeklyPost = posts.find((p) => p.title === weekly.name) as Record<string, unknown>;
    expect(weeklyPost).toBeTruthy();
    expect(weeklyPost.repeatType).toBe("weekly");
    expect(weeklyPost.weekday).toBe(7);
    const dailyPost = posts.find((p) => p.title === "中书省·每日方案规划") as Record<string, unknown>;
    expect(dailyPost.repeatType).toBe("daily");
    expect(dailyPost.weekday).toBeUndefined();
  });

  it("只按四要素匹配：同名但时间不同不算已存在", async () => {
    const { deps } = mkDeps([{ ...row(official, list[0], 7), runTime: "23:59" }]);
    const r = await createOfficialCrons(deps, official);
    expect(r.created).toBe(list.length);
    expect(r.skipped).toBe(0);
  });

  it("他省同名任务不误判（agentId 参与匹配）", async () => {
    const { deps } = mkDeps([{ ...row(official, list[0], 8), agentId: "shangshu" }]);
    const r = await createOfficialCrons(deps, official);
    expect(r.created).toBe(list.length);
    expect(r.skipped).toBe(0);
  });

  it("后端返回裸数组（无 code/data 包裹）也能识别已存在", async () => {
    const { deps, posts } = mkDeps(list.map((c, i) => row(official, c, i + 1)), "jwt", true);
    const r = await createOfficialCrons(deps, official);
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(list.length);
    expect(posts).toHaveLength(0);
  });

  it("后端 400（旧版后端不认 agentId/executeKind）：不再静默吞掉，ok=false 并带出原因", async () => {
    const posts: Array<Record<string, unknown>> = [];
    const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ code: 0, data: [] }) });
      posts.push(JSON.parse(String(init?.body)));
      return Promise.resolve({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            code: 400,
            message: ["property agentId should not exist", "property executeKind should not exist"],
          }),
      });
    });
    const deps = {
      stApiBase: "https://example.test/api",
      getAuthToken: () => "jwt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    } as unknown as TeamIpcDeps;
    const r = await createOfficialCrons(deps, official);
    expect(r.ok).toBe(false);
    expect(r.created).toBe(0);
    expect(posts).toHaveLength(list.length);
    expect(r.error).toContain(`${list.length} 条定时任务创建失败`);
    expect(r.error).toContain("HTTP 400");
    expect(r.error).toContain("agentId should not exist");
  });

  it("部分失败：成功的照常计数，失败条数写进 error", async () => {
    let n = 0;
    const fetchImpl = jest.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ code: 0, data: [] }) });
      n++;
      return Promise.resolve(
        n === 1
          ? { ok: true, status: 200, json: () => Promise.resolve({ code: 0, data: { id: 1 } }) }
          : { ok: false, status: 500, json: () => Promise.resolve({ message: "内部错误" }) },
      );
    });
    const deps = {
      stApiBase: "https://example.test/api",
      getAuthToken: () => "jwt",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    } as unknown as TeamIpcDeps;
    const r = await createOfficialCrons(deps, official);
    expect(r.ok).toBe(false);
    expect(r.created).toBe(1);
    expect(r.error).toContain(`${list.length - 1} 条定时任务创建失败`);
    expect(r.error).toContain("HTTP 500");
  });

  it("排期漂移：周任务被历史版本建成 daily → PATCH 修正为 weekly（不重复建）", async () => {
    const weeklyCron = DEFAULT_CRONS.zhongshu.find((c) => c.expr === "0 20 * * 0")!;
    const { deps, posts, patches } = mkDeps([row("zhongshu", weeklyCron, 42, "daily")]);
    const r = await createOfficialCrons(deps, "zhongshu");
    expect(r.fixed).toBe(1);
    expect(r.deduped).toBe(0);
    expect(r.skipped).toBe(1);
    expect(r.created).toBe(DEFAULT_CRONS.zhongshu.length - 1);
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toContain("/scheduled-tasks/42");
    expect(patches[0].body).toEqual({ repeatType: "weekly", weekday: 7 });
    expect(posts.map((p) => p.title)).not.toContain(weeklyCron.name);
  });

  it("已是 weekly：不再修正（幂等）", async () => {
    const weeklyCron = DEFAULT_CRONS.zhongshu.find((c) => c.expr === "0 20 * * 0")!;
    const { deps, patches } = mkDeps([row("zhongshu", weeklyCron, 42, "weekly")]);
    const r = await createOfficialCrons(deps, "zhongshu");
    expect(r.fixed).toBe(0);
    expect(patches).toHaveLength(0);
  });

  it("未登录：不发请求，直接失败", async () => {
    const { deps, fetchImpl } = mkDeps([], null);
    const r = await createOfficialCrons(deps, official);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("未登录");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
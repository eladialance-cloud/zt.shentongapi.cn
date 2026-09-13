// 删官署的定时任务必须精确匹配，避免同名误删（2026-09-13 架构审查 P0）
jest.mock("electron", () => ({ ipcMain: { handle: () => {}, removeHandler: () => {} } }));

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { removeOfficial } from "../../electron/main/team-ipc";

interface FakeCall { method: string; url: string }

function makeDeps(home: string, calls: FakeCall[], items: unknown[], token = "tok") {
  const fetchImpl = (async (url: string, init?: { method?: string }) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url: String(url) });
    return { ok: true, json: async () => (method === "GET" ? { data: items } : { code: 0 }) } as unknown as Response;
  }) as unknown as typeof fetch;
  return {
    hermesHome: home,
    edictProfilesDir: home,
    edictDataRoot: home,
    initBitable: async () => ({ ok: true }),
    ensureAgents: async () => ({ ok: true, created: [] }),
    stApiBase: "https://api.test",
    getAuthToken: () => token,
    fetchImpl,
  };
}

describe("removeOfficial", () => {
  test("只删 agentId+标题+时间+星期 全匹配的那条", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "st-rm-"));
    const calls: FakeCall[] = [];
    const items = [
      { id: 11, title: "中书省·每日方案规划", agentId: "zhongshu", runTime: "07:00", weekday: null },
      { id: 12, title: "中书省·每日方案规划", agentId: "hubu", runTime: "07:00", weekday: null },
      { id: 13, title: "中书省·每日方案规划", agentId: "zhongshu", runTime: "08:00", weekday: null },
    ];
    const r = await removeOfficial(makeDeps(home, calls, items) as never, "zhongshu");
    expect(r.ok).toBe(true);
    const deletes = calls.filter((c) => c.method === "DELETE").map((c) => c.url);
    expect(deletes).toEqual(["https://api.test/scheduled-tasks/11"]);
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
  });

  test("删掉官署的 profile 目录", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "st-rm-"));
    const dir = path.join(home, "profiles", "gongbu");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SOUL.md"), "x", "utf-8");
    const r = await removeOfficial(makeDeps(home, [], []) as never, "gongbu");
    expect(r.ok).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  test("未登录时不发请求，但目录仍被删除", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "st-rm-"));
    fs.mkdirSync(path.join(home, "profiles", "libu"), { recursive: true });
    const calls: FakeCall[] = [];
    const r = await removeOfficial(makeDeps(home, calls, [], "") as never, "libu");
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(0);
    expect(fs.existsSync(path.join(home, "profiles", "libu"))).toBe(false);
  });
});
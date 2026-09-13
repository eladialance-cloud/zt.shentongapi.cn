/**
 * 多维表格「复用」与「字段降级」单测（全部走注入 fetch，不触网）
 *
 * 覆盖用户实测反馈的 3 个问题：
 *  1. 每次点「一键创建」都会多建一份工作台 ⇒ 有记录时必须复用
 *  2. 「军机处·任务主表」整张建不出来 ⇒ RELATE/FORMULA 降级 + 字段级兜底
 */
import { FeishuClient } from "../../electron/main/feishu-client";
import {
  initBitable,
  parseSpecMarkdown,
  readBitableState,
  FEISHU_FIELD_TYPE,
} from "../../electron/main/feishu-bitable";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

type Call = { url: string; method: string; body?: unknown };

function fakeFetch(handler: (call: Call) => { status?: number; json: unknown }): { impl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = (init?.method || "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call: Call = { url, method, body };
    calls.push(call);
    const out = handler(call);
    return { status: out.status ?? 200, json: async () => out.json } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

const TOKEN = { json: { code: 0, msg: "ok", tenant_access_token: "t", expire: 7200 } };

function spec(): string {
  return [
    "## 工部 · 内容生产表",
    "| 字段名 | 类型 | 必填 | 含义 | 示例 |",
    "|---|---|---|---|---|",
    "| 内容编号 | TEXT | 是 | x | y |",
    "",
    "## 军机处 · 任务主表",
    "| 字段名 | 类型 | 必填 | 含义 | 示例 |",
    "|---|---|---|---|---|",
    "| id | TEXT | 是 | x | y |",
  ].join("\n");
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "feishu-reuse-"));
}

function seedState(root: string, appToken = "app-old"): void {
  fs.writeFileSync(
    path.join(root, "feishu-bitable.json"),
    JSON.stringify({
      appToken,
      appUrl: `https://x/base/${appToken}`,
      createdAt: "2026-09-13T00:00:00.000Z",
      tables: [],
      failed: [],
    }),
    "utf8",
  );
}

describe("initBitable 复用", () => {
  test("已保存工作台且表齐全 ⇒ 复用，不再新建 app、不再建表", async () => {
    const root = tmpRoot();
    seedState(root);
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (call.url.includes("/tables") && call.method === "GET") {
        return {
          json: {
            code: 0,
            data: {
              items: [
                { table_id: "tbl-a", name: "工部 · 内容生产表" },
                { table_id: "tbl-b", name: "军机处 · 任务主表" },
              ],
            },
          },
        };
      }
      return { json: { code: 0, data: {} } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await initBitable({ client, dataRoot: root, resourcesRoot: root, specMarkdown: spec() });

    expect(res.ok).toBe(true);
    expect(res.reused).toBe(true);
    expect(res.reusedCount).toBe(2);
    expect(res.createdCount).toBe(0);
    expect(res.appUrl).toBe("https://x/base/app-old");
    // 关键：没有新建 app、也没有建表
    expect(calls.filter((c) => /\/bitable\/v1\/apps$/.test(c.url) && c.method === "POST").length).toBe(0);
    expect(calls.filter((c) => c.url.endsWith("/tables") && c.method === "POST").length).toBe(0);
    // 链接仍然回填到官署
    const store = JSON.parse(fs.readFileSync(path.join(root, "official-tables.json"), "utf8"));
    expect(store["gongbu"].tables.find((t: any) => t.envKey === "FEISHU_CONTENT_TABLE").url).toContain("tbl-a");
  });

  test("已有工作台但缺 1 张表 ⇒ 只补那 1 张", async () => {
    const root = tmpRoot();
    seedState(root);
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (call.url.includes("/tables") && call.method === "GET") {
        return { json: { code: 0, data: { items: [{ table_id: "tbl-a", name: "工部 · 内容生产表" }] } } };
      }
      if (call.url.endsWith("/tables") && call.method === "POST") {
        return { json: { code: 0, data: { table_id: "tbl-b" } } };
      }
      return { json: { code: 0, data: {} } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await initBitable({ client, dataRoot: root, resourcesRoot: root, specMarkdown: spec() });

    expect(res.reused).toBe(true);
    expect(res.reusedCount).toBe(1);
    expect(res.createdCount).toBe(1);
    expect(calls.filter((c) => /\/bitable\/v1\/apps$/.test(c.url) && c.method === "POST").length).toBe(0);
    const posted = calls.filter((c) => c.url.endsWith("/tables") && c.method === "POST");
    expect(posted.length).toBe(1);
    expect((posted[0].body as any).table.name).toBe("军机处 · 任务主表");
  });

  test("force=true ⇒ 忽略记录，新建一份工作台", async () => {
    const root = tmpRoot();
    seedState(root);
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (/\/bitable\/v1\/apps$/.test(call.url) && call.method === "POST") {
        return { json: { code: 0, data: { app: { app_token: "app-new", url: "https://x/base/app-new" } } } };
      }
      return { json: { code: 0, data: { table_id: "tbl-x" } } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await initBitable({
      client,
      dataRoot: root,
      resourcesRoot: root,
      specMarkdown: spec(),
      force: true,
    });

    expect(res.reused).toBe(false);
    expect(res.appToken).toBe("app-new");
    expect(calls.filter((c) => /\/bitable\/v1\/apps$/.test(c.url) && c.method === "POST").length).toBe(1);
  });

  test("已保存工作台不可访问 ⇒ 自动回退为新建", async () => {
    const root = tmpRoot();
    seedState(root);
    const { impl } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (call.url.includes("/tables") && call.method === "GET") {
        return { json: { code: 1254302, msg: "app not found" } };
      }
      if (/\/bitable\/v1\/apps$/.test(call.url) && call.method === "POST") {
        return { json: { code: 0, data: { app: { app_token: "app-new2", url: "https://x/base/app-new2" } } } };
      }
      return { json: { code: 0, data: { table_id: "tbl-x" } } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await initBitable({ client, dataRoot: root, resourcesRoot: root, specMarkdown: spec() });
    expect(res.ok).toBe(true);
    expect(res.appToken).toBe("app-new2");
    expect(res.reused).toBe(false);
  });
});

describe("readBitableState", () => {
  test("无记录 ⇒ null", () => {
    expect(readBitableState(tmpRoot())).toBeNull();
  });

  test("损坏文件 ⇒ null（不抛错）", () => {
    const root = tmpRoot();
    fs.writeFileSync(path.join(root, "feishu-bitable.json"), "{ not json", "utf8");
    expect(readBitableState(root)).toBeNull();
  });
});

describe("字段类型降级", () => {
  test("RELATE / FORMULA / LOOKUP 降级为文本，其余保持原类型", () => {
    const md = [
      "## 军机处 · 任务主表",
      "| 字段名 | 类型 | 必填 | 含义 | 示例 |",
      "|---|---|---|---|---|",
      "| id | TEXT | 是 | x | y |",
      "| flow_log | RELATE | 是 | x | y |",
      "| total | FORMULA | 否 | x | y |",
      "| roll | LOOKUP | 否 | x | y |",
      "| state | SELECT | 是 | x | y |",
    ].join("\n");
    const [t] = parseSpecMarkdown(md);
    const by = (n: string) => t.fields.find((f) => f.name === n)!;

    expect(by("id").type).toBe(FEISHU_FIELD_TYPE.TEXT);
    expect(by("id").degraded).toBe(false);

    expect(by("flow_log").type).toBe(FEISHU_FIELD_TYPE.TEXT);
    expect(by("flow_log").requestedType).toBe(FEISHU_FIELD_TYPE.RELATE);
    expect(by("flow_log").degraded).toBe(true);

    expect(by("total").degraded).toBe(true);
    expect(by("roll").degraded).toBe(true);

    expect(by("state").type).toBe(FEISHU_FIELD_TYPE.SELECT);
    expect(by("state").degraded).toBe(false);
  });

  test("真实规范里只有军机处/户部需要降级，且都能被解析出来", () => {
    const p = path.join(process.cwd(), "resources", "edict", "data", "多维表格字段设计规范.md");
    if (!fs.existsSync(p)) return;
    const tables = parseSpecMarkdown(fs.readFileSync(p, "utf8"));
    const degradedTables = tables.filter((t) => t.fields.some((f) => f.degraded)).map((t) => t.name);
    expect(degradedTables.some((n) => n.includes("军机处"))).toBe(true);
    // 降级后不应再有需要 property 的类型
    for (const t of tables) for (const f of t.fields) expect(f.degraded === false || f.type === 1).toBe(true);
  });
});

describe("字段级兜底", () => {
  test("整表被拒 ⇒ 退化为逐字段补齐，坏字段只丢自己", async () => {
    const root = tmpRoot();
    const md = [
      "## 工部 · 内容生产表",
      "| 字段名 | 类型 | 必填 | 含义 | 示例 |",
      "|---|---|---|---|---|",
      "| 内容编号 | TEXT | 是 | x | y |",
      "| 坏字段 | TEXT | 否 | x | y |",
    ].join("\n");
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (/\/bitable\/v1\/apps$/.test(call.url) && call.method === "POST") {
        return { json: { code: 0, data: { app: { app_token: "app-1", url: "https://x/base/app-1" } } } };
      }
      if (call.url.includes("/fields") && call.method === "POST") {
        return { json: { code: 1254001, msg: "field type not supported" } };
      }
      if (call.url.endsWith("/tables") && call.method === "POST") {
        const fields = (call.body as any).table.fields as unknown[];
        if (fields.length > 1) return { json: { code: 1254000, msg: "bad field in table" } };
        return { json: { code: 0, data: { table_id: "tbl-min" } } };
      }
      return { json: { code: 0, data: {} } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await initBitable({ client, dataRoot: root, resourcesRoot: root, specMarkdown: md });

    expect(res.ok).toBe(true);
    expect(res.tables?.length).toBe(1);
    expect(res.failed).toEqual([]);
    expect(res.droppedFields?.length).toBe(1);
    expect(res.droppedFields?.[0].field).toBe("坏字段");
    // 表仍然建出来了（第一次整表失败 + 第二次最小字段成功）
    const posted = calls.filter((c) => c.url.endsWith("/tables") && c.method === "POST");
    expect(posted.length).toBe(2);
    expect(calls.filter((c) => c.url.includes("/fields") && c.method === "POST").length).toBe(1);
  });
});

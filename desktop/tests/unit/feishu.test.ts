/**
 * 飞书客户端 + 多维表格初始化单测（全部走注入 fetch，不触网）
 */
import { FeishuClient } from "../../electron/main/feishu-client";
import { parseSpecMarkdown, FEISHU_FIELD_TYPE, TABLE_ENV_KEY, normalizeTableName, initBitable } from "../../electron/main/feishu-bitable";
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
    return {
      status: out.status ?? 200,
      json: async () => out.json,
    } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

describe("feishu-client", () => {
  test("getTenantAccessToken 缓存复用（第二次不再请求）", async () => {
    const { impl, calls } = fakeFetch(() => ({
      json: { code: 0, msg: "ok", tenant_access_token: "t-abc", expire: 7200 },
    }));
    const c = new FeishuClient({ appId: "cli_x", appSecret: "sec", fetchImpl: impl });
    expect(await c.getTenantAccessToken()).toEqual({ ok: true, data: "t-abc" });
    expect(await c.getTenantAccessToken()).toEqual({ ok: true, data: "t-abc" });
    expect(calls.filter((x) => x.url.includes("tenant_access_token")).length).toBe(1);
  });

  test("未配置凭证直接报错", async () => {
    const c = new FeishuClient({ appId: "", appSecret: "" });
    const r = await c.getTenantAccessToken();
    expect(r.ok).toBe(false);
  });

  test("token 失效（99991663）自动刷新重试一次", async () => {
    let tokenCalls = 0;
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) {
        tokenCalls++;
        return { json: { code: 0, msg: "ok", tenant_access_token: `t-${tokenCalls}`, expire: 7200 } };
      }
      // 第一次业务请求返回 token 失效
      if (call.url.includes("/bitable/v1/apps") && call.method === "POST" && tokenCalls === 1) {
        return { json: { code: 99991663, msg: "token expired" } };
      }
      return { json: { code: 0, msg: "ok", data: { app: { app_token: "app-1", url: "https://x/base/app-1" } } } };
    });
    const c = new FeishuClient({ appId: "cli_x", appSecret: "sec", fetchImpl: impl });
    const r = await c.createBitableApp("测试");
    expect(r.ok).toBe(true);
    expect(r.data?.app_token).toBe("app-1");
    expect(tokenCalls).toBe(2); // 刷新了一次
    expect(calls.filter((x) => x.url.includes("/bitable/v1/apps")).length).toBe(2);
  });

  test("createTable 传字段定义并返回 table_id", async () => {
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return { json: { code: 0, tenant_access_token: "t", expire: 7200 } };
      return { json: { code: 0, data: { table_id: "tbl-1" } } };
    });
    const c = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const r = await c.createTable("app-1", "工部 · 内容生产表", [{ field_name: "标题", type: 1 }]);
    expect(r.ok).toBe(true);
    expect(r.data?.table_id).toBe("tbl-1");
    const body = calls.find((x) => x.url.endsWith("/tables"))!.body as any;
    expect(body.table.name).toBe("工部 · 内容生产表");
    expect(body.table.fields[0]).toEqual({ field_name: "标题", type: 1 });
  });
});

describe("feishu-bitable 解析", () => {
  test("解析规范 md 出表与字段类型", () => {
    const md = [
      "# 规范",
      "## 字段类型说明",
      "| 标识 | 说明 | 对应 | 备注 |",
      "|------|------|------|------|",
      "| TEXT | 文本 | 1 | x |",
      "",
      "## 工部 · 内容生产表",
      "| 字段名 | 类型 | 必填 | 含义 | 示例/枚举 |",
      "|-------|------|------|------|-----------|",
      "| 内容编号 | TEXT | 是 | 唯一编号 | CONT-001 |",
      "| 内容类型 | SELECT | 是 | 形式 | 短视频 |",
      "| 关联爆款结构 | TEXT | 否 | 借鉴 | 数字法 |",
      "",
      "## 附录 · 数据表创建清单（摘要）",
      "| 序号 | 所属域 | 表格名称 | 用途 |",
      "|------|--------|---------|------|",
      "| 1 | 军机处 | 任务主表 | x |",
    ].join("\n");
    const tables = parseSpecMarkdown(md);
    expect(tables.length).toBe(1);
    expect(tables[0].name).toBe("工部 · 内容生产表");
    expect(tables[0].fields.map((f) => f.name)).toEqual(["内容编号", "内容类型", "关联爆款结构"]);
    expect(tables[0].fields[0].type).toBe(FEISHU_FIELD_TYPE.TEXT);
    expect(tables[0].fields[1].type).toBe(FEISHU_FIELD_TYPE.SELECT);
    expect(tables[0].fields[1].required).toBe(true);
    expect(tables[0].fields[2].required).toBe(false);
  });

  test("真实规范文件可解析出 ≥13 张表", () => {
    const p = path.join(process.cwd(), "resources", "edict", "data", "多维表格字段设计规范.md");
    if (!fs.existsSync(p)) return; // 环境无关兜底
    const tables = parseSpecMarkdown(fs.readFileSync(p, "utf8"));
    expect(tables.length).toBeGreaterThanOrEqual(13);
    // 每张表都要有 env 键映射
    for (const t of tables) expect(TABLE_ENV_KEY[normalizeTableName(t.name)]).toBeTruthy();
  });
});

describe("initBitable", () => {
  test("建 app + 逐表建表 + 回填官署链接", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "feishu-bit-"));
    let tblSeq = 0;
    const { impl } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return { json: { code: 0, tenant_access_token: "t", expire: 7200 } };
      if (/\/bitable\/v1\/apps$/.test(call.url) && call.method === "POST") {
        return { json: { code: 0, data: { app: { app_token: "app-1", url: "https://x/base/app-1" } } } };
      }
      return { json: { code: 0, data: { table_id: `tbl-${++tblSeq}` } } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const spec = [
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
    const res = await initBitable({ client, dataRoot: root, resourcesRoot: root, specMarkdown: spec });
    expect(res.ok).toBe(true);
    expect(res.appToken).toBe("app-1");
    expect(res.tables?.length).toBe(2);
    // 工部表链接回填到 gongbu
    const store = JSON.parse(fs.readFileSync(path.join(root, "official-tables.json"), "utf8"));
    const gongbu = store["gongbu"].tables;
    const content = gongbu.find((t: any) => t.envKey === "FEISHU_CONTENT_TABLE");
    expect(content?.url).toContain("app-1");
    // 共享表（任务主表）回填到所有官署
    const taizi = store["taizi"].tables;
    expect(taizi.find((t: any) => t.envKey === "FEISHU_TASK_MAIN_TABLE")?.url).toContain("app-1");
  });

  test("未配置凭证时报错不建表", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "feishu-bit-"));
    const client = new FeishuClient({ appId: "", appSecret: "" });
    const res = await initBitable({ client, dataRoot: root, resourcesRoot: root, specMarkdown: "## x\n|字段名|类型|必填|含义|示例|\n|---|---|---|---|---|\n|a|TEXT|是|b|c|" });
    expect(res.ok).toBe(false);
  });
});

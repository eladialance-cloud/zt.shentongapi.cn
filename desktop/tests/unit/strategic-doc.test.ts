/**
 * 战略方向文档单测（注入 fetch，不触网）
 *
 * 归属：中书省牵头维护。一键组队第 5 步创建/复用，并把链接回填到中书省的飞书表清单。
 */
import { FeishuClient } from "../../electron/main/feishu-client";
import {
  createOrReuseStrategicDoc,
  readStrategicDocState,
  STRATEGIC_DOC_ENV_KEY,
  STRATEGIC_DOC_OWNER,
} from "../../electron/main/strategic-doc";
import { getOfficialTables } from "../../electron/main/official-detail";
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

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "strategic-doc-"));
}

function okHandler(): (call: Call) => { json: unknown } {
  return (call) => {
    if (call.url.includes("tenant_access_token")) return TOKEN;
    if (call.url.includes("root_folder/meta")) return { json: { code: 0, data: { token: "fld-1" } } };
    if (call.url.includes("/docx/v1/documents") && call.url.includes("/blocks/")) {
      return { json: { code: 0, data: {} } };
    }
    if (/\/docx\/v1\/documents$/.test(call.url) && call.method === "POST") {
      return {
        json: { code: 0, data: { document: { document_id: "docx-1", url: "https://x.feishu.cn/docx/docx-1" } } },
      };
    }
    return { json: { code: 0, data: {} } };
  };
}

describe("createOrReuseStrategicDoc", () => {
  test("首次创建：建云文档 + 写提纲 + 落盘 + 回填中书省", async () => {
    const root = tmpRoot();
    const { impl, calls } = fakeFetch(okHandler());
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    let soulRefreshed = 0;
    const res = await createOrReuseStrategicDoc({
      client,
      dataRoot: root,
      refreshSoul: () => {
        soulRefreshed++;
      },
    });

    expect(res.ok).toBe(true);
    expect(res.reused).toBe(false);
    expect(res.url).toBe("https://x.feishu.cn/docx/docx-1");

    // 建文档 1 次
    expect(calls.filter((c) => /\/docx\/v1\/documents$/.test(c.url) && c.method === "POST").length).toBe(1);
    // 写了提纲
    expect(calls.filter((c) => c.url.includes("/blocks/")).length).toBeGreaterThan(0);

    // 落盘
    const state = readStrategicDocState(root);
    expect(state?.documentId).toBe("docx-1");
    expect(state?.url).toBe("https://x.feishu.cn/docx/docx-1");

    // 回填到中书省飞书表清单
    const tables = getOfficialTables(root, STRATEGIC_DOC_OWNER);
    const entry = tables.find((t) => t.envKey === STRATEGIC_DOC_ENV_KEY);
    expect(entry?.url).toBe("https://x.feishu.cn/docx/docx-1");

    expect(soulRefreshed).toBe(1);
  });

  test("已有记录 ⇒ 复用，不再建文档", async () => {
    const root = tmpRoot();
    const { impl, calls } = fakeFetch(okHandler());
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    await createOrReuseStrategicDoc({ client, dataRoot: root });
    const firstCount = calls.filter((c) => /\/docx\/v1\/documents$/.test(c.url) && c.method === "POST").length;

    const res2 = await createOrReuseStrategicDoc({ client, dataRoot: root });
    expect(res2.ok).toBe(true);
    expect(res2.reused).toBe(true);
    const secondCount = calls.filter((c) => /\/docx\/v1\/documents$/.test(c.url) && c.method === "POST").length;
    expect(secondCount).toBe(firstCount);
  });

  test("取根目录失败也能建出文档（folder_token 省略）", async () => {
    const root = tmpRoot();
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (call.url.includes("root_folder/meta")) return { json: { code: 99991672, msg: "no permission" } };
      if (/\/docx\/v1\/documents$/.test(call.url) && call.method === "POST") {
        return { json: { code: 0, data: { document: { document_id: "docx-9", url: "https://x.feishu.cn/docx/docx-9" } } } };
      }
      return { json: { code: 0, data: {} } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await createOrReuseStrategicDoc({ client, dataRoot: root });
    expect(res.ok).toBe(true);
    const created = calls.find((c) => /\/docx\/v1\/documents$/.test(c.url) && c.method === "POST");
    expect((created?.body as { folder_token?: string })?.folder_token).toBeUndefined();
  });

  test("建文档失败 ⇒ ok:false 且不写记录", async () => {
    const root = tmpRoot();
    const { impl } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (call.url.includes("root_folder/meta")) return { json: { code: 0, data: { token: "fld-1" } } };
      if (/\/docx\/v1\/documents$/.test(call.url) && call.method === "POST") {
        return { json: { code: 99991663, msg: "boom" } };
      }
      return { json: { code: 0, data: {} } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await createOrReuseStrategicDoc({ client, dataRoot: root });
    expect(res.ok).toBe(false);
    expect(readStrategicDocState(root)).toBeNull();
  });
});

/**
 * 战略方向文档单测（注入 fetch，不触网）
 *
 * 归属：中书省牵头维护。一键组队第 5 步创建/复用，并把链接回填到中书省的飞书表清单。
 */
import { FeishuClient } from "../../electron/main/feishu-client";
import {
  clearStrategyCache,
  createOrReuseStrategicDoc,
  readStrategicDoc,
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

describe("readStrategicDoc（编排器战略上下文读取）", () => {
  beforeEach(() => clearStrategyCache());

  function handlerWith(text: string, opts: { rawFail?: boolean } = {}) {
    return (call: Call): { json: unknown } => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (call.url.includes("root_folder/meta")) return { json: { code: 0, data: { token: "fld-1" } } };
      if (call.url.includes("/raw_content")) {
        if (opts.rawFail) return { json: { code: 99991672, msg: "no permission" } };
        return { json: { code: 0, data: { content: text } } };
      }
      if (/\/docx\/v1\/documents$/.test(call.url) && call.method === "POST") {
        return { json: { code: 0, data: { document: { document_id: "docx-1", url: "https://x.feishu.cn/docx/docx-1" } } } };
      }
      return { json: { code: 0, data: {} } };
    };
  }

  const rawCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("/raw_content"));

  test("未创建战略文档 ⇒ source:none，且不打飞书接口", async () => {
    const root = tmpRoot();
    const { impl, calls } = fakeFetch(handlerWith("x"));
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await readStrategicDoc(root, client);
    expect(res.ok).toBe(false);
    expect(res.source).toBe("none");
    expect(res.text).toBe("");
    expect(calls.length).toBe(0);
  });

  test("已创建 ⇒ 拉全文；TTL 内再读走缓存不重复请求", async () => {
    const root = tmpRoot();
    const { impl, calls } = fakeFetch(handlerWith("一、战略目标：跑通三省六部链路"));
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    await createOrReuseStrategicDoc({ client, dataRoot: root });

    const first = await readStrategicDoc(root, client);
    expect(first.ok).toBe(true);
    expect(first.source).toBe("feishu");
    expect(first.text).toContain("跑通三省六部链路");
    expect(first.fetchedAt).toBeTruthy();

    const second = await readStrategicDoc(root, client);
    expect(second.source).toBe("cache");
    expect(second.text).toBe(first.text);
    expect(rawCalls(calls).length).toBe(1);
  });

  test("force 忽略缓存重新拉取", async () => {
    const root = tmpRoot();
    const { impl, calls } = fakeFetch(handlerWith("战略正文"));
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    await createOrReuseStrategicDoc({ client, dataRoot: root });
    await readStrategicDoc(root, client);
    await readStrategicDoc(root, client, { force: true });
    expect(rawCalls(calls).length).toBe(2);
  });

  test("maxChars 截断超长正文", async () => {
    const root = tmpRoot();
    const { impl } = fakeFetch(handlerWith("字".repeat(200)));
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    await createOrReuseStrategicDoc({ client, dataRoot: root });
    const res = await readStrategicDoc(root, client, { maxChars: 20 });
    expect(res.text.startsWith("字".repeat(20))).toBe(true);
    expect(res.text).toContain("已截断");
  });

  test("拉取失败且无缓存 ⇒ ok:false / source:error", async () => {
    const root = tmpRoot();
    const { impl } = fakeFetch(handlerWith("", { rawFail: true }));
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    await createOrReuseStrategicDoc({ client, dataRoot: root });
    const res = await readStrategicDoc(root, client);
    expect(res.ok).toBe(false);
    expect(res.source).toBe("error");
    expect(res.error).toBeTruthy();
  });

  test("拉取失败但有旧缓存 ⇒ 回旧缓存并带 error（编排不阻塞）", async () => {
    const root = tmpRoot();
    const { impl } = fakeFetch(handlerWith("战略：主攻私域增长"));
    const good = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    await createOrReuseStrategicDoc({ client: good, dataRoot: root });
    await readStrategicDoc(root, good);
    const { impl: badImpl } = fakeFetch(handlerWith("", { rawFail: true }));
    const bad = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: badImpl });
    const res = await readStrategicDoc(root, bad, { force: true });
    expect(res.ok).toBe(true);
    expect(res.source).toBe("cache");
    expect(res.error).toBeTruthy();
    expect(res.text).toContain("主攻私域增长");
  });
});

describe("战略表版本留痕（recordInitialVersion）", () => {
  test("建档后回写 V1.0 记录", async () => {
    const root = tmpRoot();
    const { impl } = fakeFetch(okHandler());
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const seen: string[] = [];
    const res = await createOrReuseStrategicDoc({
      client,
      dataRoot: root,
      recordInitialVersion: async (state) => {
        seen.push(state.documentId);
      },
    });
    expect(res.ok).toBe(true);
    expect(seen).toEqual(["docx-1"]);
  });

  test("版本留痕失败不影响建档（best-effort）", async () => {
    const root = tmpRoot();
    const { impl } = fakeFetch(okHandler());
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await createOrReuseStrategicDoc({
      client,
      dataRoot: root,
      recordInitialVersion: async () => {
        throw new Error("飞书接口挂了");
      },
    });
    expect(res.ok).toBe(true);
    expect(readStrategicDocState(root)?.documentId).toBe("docx-1");
  });

  test("复用已有文档时不重复写版本记录", async () => {
    const root = tmpRoot();
    const { impl } = fakeFetch(okHandler());
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    let calls = 0;
    const recordInitialVersion = async () => {
      calls += 1;
    };
    await createOrReuseStrategicDoc({ client, dataRoot: root, recordInitialVersion });
    await createOrReuseStrategicDoc({ client, dataRoot: root, recordInitialVersion });
    expect(calls).toBe(1);
  });
});

/**
 * MaxkbClient 单元测试
 * 覆盖：文本解码校验（UTF-8/GBK/BOM/二进制拒绝）、段落切分（截断/聚合）、
 *       创建数据集请求体、文档上传响应形状、登录单飞与 401 自动重登
 * 运行：node -r ts-node/register --test test/unit/maxkb.client.spec.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConfigService } from "@nestjs/config";
import { MaxkbClient } from "../../src/modules/knowledge-engine/maxkb.client";

const BASE_URL = "http://maxkb.test";

function makeClient(overrides: Record<string, string> = {}): MaxkbClient {
  const values: Record<string, string> = {
    MAXKB_BASE_URL: BASE_URL,
    MAXKB_USERNAME: "admin",
    MAXKB_PASSWORD: "Admin123456",
    MAXKB_TIMEOUT_MS: "5000",
    MAXKB_EMBEDDING_MODEL_ID: "model-1",
    ...overrides,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService;
  return new MaxkbClient(config);
}

/** 简易 fetch 桩：login 路径固定返回 token，其余请求按队列依次返回 */
class FetchMock {
  calls: Array<{ url: string; init?: any }> = [];
  private queue: Array<{ path: string; status: number; body: unknown }> = [];
  private loginBody: unknown = { code: 200, message: "success", data: { token: "tok-1" } };
  private restore: (() => void) | null = null;

  login(body: unknown): this {
    this.loginBody = body;
    return this;
  }

  enqueue(path: string, status: number, body: unknown): this {
    this.queue.push({ path, status, body });
    return this;
  }

  install(): void {
    const self = this;
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: any, init?: any) => {
      const u = String(url);
      self.calls.push({ url: u, init });
      const path = new URL(u).pathname;
      let status = 200;
      let body: unknown;
      if (path.endsWith("/user/login")) {
        body = self.loginBody;
      } else {
        const entry = self.queue.shift();
        if (!entry) {
          throw new Error("fetch 队列为空: " + u);
        }
        status = entry.status;
        body = entry.body;
      }
      return new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    this.restore = () => {
      globalThis.fetch = original;
    };
  }

  uninstall(): void {
    if (this.restore) {
      this.restore();
      this.restore = null;
    }
  }
}

describe("bufferToText", () => {
  it("UTF-8 中文正常解码", () => {
    const c = makeClient();
    const text = (c as any).bufferToText({
      originalname: "a.txt",
      mimetype: "text/plain",
      buffer: Buffer.from("深瞳AI 知识库自测", "utf8"),
    });
    assert.equal(text, "深瞳AI 知识库自测");
  });

  it("GBK 编码文本应拒绝（避免乱码入库）", () => {
    const c = makeClient();
    // "中文" 的 GBK 编码字节
    const text = (c as any).bufferToText({
      originalname: "gbk.txt",
      mimetype: "text/plain",
      buffer: Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
    });
    assert.equal(text, null);
  });

  it("含 NUL 字节视为二进制", () => {
    const c = makeClient();
    const text = (c as any).bufferToText({
      originalname: "a.bin",
      mimetype: "text/plain",
      buffer: Buffer.from([0x61, 0x00, 0x62]),
    });
    assert.equal(text, null);
  });

  it("非文本 MIME 不尝试解析", () => {
    const c = makeClient();
    const text = (c as any).bufferToText({
      originalname: "a.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("hello", "utf8"),
    });
    assert.equal(text, null);
  });

  it("UTF-8 BOM 被剥离", () => {
    const c = makeClient();
    // EF BB BF = BOM，E4 BD A0 E5 A5 BD = "你好"
    const text = (c as any).bufferToText({
      originalname: "bom.txt",
      mimetype: "text/plain",
      buffer: Buffer.from([0xef, 0xbb, 0xbf, 0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd]),
    });
    assert.equal(text, "你好");
  });

  it("application/json 文本可解析", () => {
    const c = makeClient();
    const text = (c as any).bufferToText({
      originalname: "a.json",
      mimetype: "application/json",
      buffer: Buffer.from('{"a":1}', "utf8"),
    });
    assert.equal(text, '{"a":1}');
  });
});

describe("splitParagraphs", () => {
  it("按行切分、去空行、聚合到 maxLen", () => {
    const c = makeClient();
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push("第" + i + "行内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容内容");
    }
    const out: string[] = (c as any).splitParagraphs(lines.join("\n") + "\n\n\n", 1000, 100000);
    assert.ok(out.length >= 2, "50 行约 1750 字符应被切成多段");
    out.forEach((p: string) => assert.ok(p.length <= 1000, "单段不应超过 maxLen"));
    assert.ok(out.join("").length > 1000, "内容不应丢失");
  });

  it("CRLF 归一化", () => {
    const c = makeClient();
    const out: string[] = (c as any).splitParagraphs("a\r\nb\r\nc", 1000, 100000);
    assert.deepEqual(out, ["a\nb\nc"]);
  });

  it("超长行按 hardMax 硬截断", () => {
    const c = makeClient();
    const long = "x".repeat(250000);
    const out: string[] = (c as any).splitParagraphs(long, 1000, 100000);
    assert.equal(out.length, 3);
    assert.equal(out[0].length, 100000);
    assert.equal(out[2].length, 50000);
  });

  it("尾段不丢失", () => {
    const c = makeClient();
    const out: string[] = (c as any).splitParagraphs("line1\nline2\ntail", 1000, 100000);
    assert.deepEqual(out, ["line1\nline2\ntail"]);
  });
});

describe("createKnowledgeBase", () => {
  it("请求体包含必填字段并返回 knowledge_id", async () => {
    const mock = new FetchMock();
    mock.enqueue("/admin/api/workspace/default/knowledge/base", 200, { code: 200, data: { knowledge_id: "kb-1" } });
    mock.install();
    try {
      const c = makeClient();
      const id = await c.createKnowledgeBase("测试库");
      assert.equal(id, "kb-1");
      const loginCall = mock.calls.find((x) => x.url.includes("/user/login"));
      assert.ok(loginCall, "应先生成 token");
      const createCall = mock.calls.find((x) => x.url.includes("/knowledge/base"));
      const body = JSON.parse(String(createCall?.init?.body));
      assert.equal(body.name, "测试库");
      assert.equal(body.desc, "");
      assert.equal(body.folder_id, "default");
      assert.equal(body.embedding_model_id, "model-1");
    } finally {
      mock.uninstall();
    }
  });

  it("未配置 embedding 模型时请求体不带该字段", async () => {
    const mock = new FetchMock();
    mock.enqueue("/knowledge/base", 200, { code: 200, data: { id: "kb-2" } });
    mock.install();
    try {
      const c = makeClient({ MAXKB_EMBEDDING_MODEL_ID: "" });
      const id = await c.createKnowledgeBase("测试库", "描述");
      assert.equal(id, "kb-2");
      const createCall = mock.calls.find((x) => x.url.includes("/knowledge/base"));
      const body = JSON.parse(String(createCall?.init?.body));
      assert.equal(body.desc, "描述");
      assert.equal("embedding_model_id" in body, false);
    } finally {
      mock.uninstall();
    }
  });

  it("未配置时抛出 MaxkbException", async () => {
    const c = makeClient({ MAXKB_BASE_URL: "" });
    await assert.rejects(() => c.createKnowledgeBase("x"), /MAXKB 未配置/);
  });
});

describe("uploadDocument", () => {
  it("非文本 MIME 直接抛出", async () => {
    const c = makeClient();
    await assert.rejects(
      () => c.uploadDocument("kb-1", { originalname: "a.pdf", mimetype: "application/pdf", buffer: Buffer.from("x") }),
      /暂不支持自动解析的文件类型/,
    );
  });

  it("空内容抛出", async () => {
    const c = makeClient();
    await assert.rejects(
      () => c.uploadDocument("kb-1", { originalname: "empty.txt", mimetype: "text/plain", buffer: Buffer.from("\n\n\n") }),
      /文件内容为空/,
    );
  });

  it("提交解析后的段落并返回文档 ID/状态", async () => {
    const mock = new FetchMock();
    mock.enqueue("/admin/api/workspace/default/knowledge/kb-1/document", 200, { code: 200, data: { id: "doc-1", status: "pending" } });
    mock.install();
    try {
      const c = makeClient();
      const doc = await c.uploadDocument("kb-1", {
        originalname: "test.txt",
        mimetype: "text/plain",
        buffer: Buffer.from("第一行\n第二行\n", "utf8"),
      });
      assert.equal(doc.engineDocumentId, "doc-1");
      assert.equal(doc.status, "pending");
      const createCall = mock.calls.find((x) => x.url.includes("/document"));
      const body = JSON.parse(String(createCall?.init?.body));
      assert.equal(body.name, "test.txt");
      assert.equal(Array.isArray(body.paragraphs), true);
      // 两行不足 maxLen，被聚合为单段（段内保留换行）
      assert.equal(body.paragraphs.length, 1);
      assert.equal(body.paragraphs[0].content, "第一行" + String.fromCharCode(10) + "第二行");
    } finally {
      mock.uninstall();
    }
  });

  it("响应为数组形状 [doc, id, kb] 也能解析", async () => {
    const mock = new FetchMock();
    mock.enqueue("/document", 200, { code: 200, data: [{ id: "doc-2", status: "completed" }, "doc-2", "kb-1"] });
    mock.install();
    try {
      const c = makeClient();
      const doc = await c.uploadDocument("kb-1", { originalname: "a.txt", mimetype: "text/plain", buffer: Buffer.from("内容", "utf8") });
      assert.equal(doc.engineDocumentId, "doc-2");
      assert.equal(doc.status, "completed");
    } finally {
      mock.uninstall();
    }
  });

  it("未知状态归一化为 pending", async () => {
    const mock = new FetchMock();
    mock.enqueue("/document", 200, { code: 200, data: { id: "doc-3", status: "processing" } });
    mock.install();
    try {
      const c = makeClient();
      const doc = await c.uploadDocument("kb-1", { originalname: "a.txt", mimetype: "text/plain", buffer: Buffer.from("内容", "utf8") });
      assert.equal(doc.status, "pending");
    } finally {
      mock.uninstall();
    }
  });
});

describe("认证", () => {
  it("并发请求只登录一次（单飞）", async () => {
    const mock = new FetchMock();
    mock.enqueue("/admin/api/workspace/default/knowledge", 200, { code: 200, data: [] });
    mock.enqueue("/admin/api/workspace/default/knowledge", 200, { code: 200, data: [] });
    mock.install();
    try {
      const c = makeClient();
      await Promise.all([c.ping(), c.ping()]);
      const loginCount = mock.calls.filter((x) => x.url.includes("/user/login")).length;
      assert.equal(loginCount, 1);
    } finally {
      mock.uninstall();
    }
  });

  it("token 失效（401/登录过期）自动重登重试", async () => {
    const mock = new FetchMock();
    mock.enqueue("/knowledge", 401, "login expired");
    mock.enqueue("/knowledge", 200, { code: 200, data: [] });
    mock.install();
    try {
      const c = makeClient();
      assert.equal(await c.ping(), true);
      const loginCount = mock.calls.filter((x) => x.url.includes("/user/login")).length;
      assert.equal(loginCount, 2);
    } finally {
      mock.uninstall();
    }
  });

  it("未配置时 ping 返回 false", async () => {
    const c = makeClient({ MAXKB_BASE_URL: "" });
    assert.equal(await c.ping(), false);
  });
});
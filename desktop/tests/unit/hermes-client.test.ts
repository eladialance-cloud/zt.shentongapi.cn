/**
 * HermesClient 原生控制平面客户端单测（P0）
 * - 注入 fetchImpl 与 token，不依赖真实 Hermes 服务（零路径依赖）
 * - 覆盖：getLearningGraph 鉴权与解析 / 字段缺失容错 / 401 / 超时失败 / isAlive 容错 / memory providers
 */
import { HermesClient, HermesApiError, HERMES_BASE_URL } from "../../electron/main/hermes-client";

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "C:/test/userData"),
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => false),
    encryptString: jest.fn((s: string) => Buffer.from(s, "utf8") as unknown as Buffer),
    decryptString: jest.fn((b: Buffer) => b.toString("utf8")),
  },
}));

interface MockFetchCall {
  url: string;
  init: { method?: string; headers?: Record<string, string>; signal?: AbortSignal; body?: unknown };
}

function okJson(body: unknown): Response {
  // jest jsdom 环境无 Response 全局，返回最小兼容对象（客户端只用 ok/status/text）
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    text: async () => body,
  } as unknown as Response;
}

describe("HermesClient", () => {
  const TOKEN = "shentong-session-test";

  it("getLearningGraph 携带 X-Hermes-Session-Token 并解析 nodes/edges/clusters/memory/stats", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string; headers?: Record<string, string> }) => {
      calls.push({ url, init });
      return okJson({
        nodes: [{ id: "n1", label: "节点一", kind: "skill", date: "2026-08-31" }],
        edges: [{ from: "a", to: "b" }],
        clusters: [{ id: "c1" }],
        memory: [{ key: "k" }],
        stats: { total: 1 },
      });
    }) as unknown as typeof fetch;

    const client = new HermesClient({ token: TOKEN, fetchImpl, timeoutMs: 5000 });
    const graph = await client.getLearningGraph();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/learning/graph");
    expect(calls[0].init.headers?.["X-Hermes-Session-Token"]).toBe(TOKEN);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].id).toBe("n1");
    expect(graph.edges).toHaveLength(1);
    expect(graph.clusters).toHaveLength(1);
    expect(graph.memory).toHaveLength(1);
    expect(graph.stats).toEqual({ total: 1 });
  });

  it("响应字段缺失时回退空数组/空对象，不抛错", async () => {
    const fetchImpl = (async () => okJson({ nodes: null })) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const graph = await client.getLearningGraph();
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.clusters).toEqual([]);
    expect(graph.memory).toEqual([]);
    expect(graph.stats).toEqual({});
  });

  it("401 未授权抛 HermesApiError（status=401），供调用方降级", async () => {
    const fetchImpl = (async () => errResponse(401, "unauthorized")) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    await expect(client.getLearningGraph()).rejects.toMatchObject({
      name: "HermesApiError",
      status: 401,
    });
  });

  it("fetch 拒绝（服务未启动/超时）抛 HermesApiError", async () => {
    const fetchImpl = (async () => {
      throw new Error("fetch failed: connection refused");
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    await expect(client.getLearningGraph()).rejects.toBeInstanceOf(HermesApiError);
  });

  it("isAlive 在服务未就绪时返回 false 而非抛错", async () => {
    const fetchImpl = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    await expect(client.isAlive()).resolves.toBe(false);
  });

  it("getMemoryProviders 解析 providers 列表（MEMORY.md 内容仍走本地文件读写）", async () => {
    const fetchImpl = (async () => okJson({ providers: [{ name: "local", status: "ok", available: true }] })) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const providers = await client.getMemoryProviders();
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe("local");
  });

  it("getCurator 解析策展状态（paused/enabled/interval_hours）", async () => {
    const fetchImpl = (async () => okJson({ enabled: true, paused: false, interval_hours: 6, last_run_at: "2026-09-01T00:00:00Z" })) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const state = await client.getCurator();
    expect(state.enabled).toBe(true);
    expect(state.paused).toBe(false);
    expect(state.interval_hours).toBe(6);
  });

  it("setCuratorPaused 以 PUT 提交 paused 状态", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) => {
      calls.push({ url, init: init as never });
      return okJson({ ok: true });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.setCuratorPaused(true);
    expect(res.ok).toBe(true);
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/curator/paused");
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ paused: true });
  });

  it("runCurator 以 POST 触发后台策展", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string }) => {
      calls.push({ url, init: init as never });
      return okJson({ ok: true, pid: 1234 });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.runCurator();
    expect(res.ok).toBe(true);
    expect(res.pid).toBe(1234);
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/curator/run");
    expect(calls[0].init.method).toBe("POST");
  });

  it("status 在服务未就绪时返回 null 而非抛错", async () => {
    const fetchImpl = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    await expect(client.status()).resolves.toBeNull();
  });

  it("getSystemStats 解析 cpu_percent/hermes_version", async () => {
    const fetchImpl = (async () => okJson({ hermes_version: "0.20.5", cpu_percent: 12.3, memory: { used: 1024 } })) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const stats = await client.getSystemStats();
    expect(stats.cpu_percent).toBe(12.3);
    expect(stats.hermes_version).toBe("0.20.5");
  });

  it("不传 token 时请求不带 X-Hermes-Session-Token（读凭据由调用方负责）", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string; headers?: Record<string, string> }) => {
      calls.push({ url, init });
      return okJson({ nodes: [] });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ fetchImpl });
    await client.getLearningGraph();
    expect(calls[0].init.headers?.["X-Hermes-Session-Token"]).toBeUndefined();
  });

  it("listSkills 解析数组响应（GET /api/skills）", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string }) => {
      calls.push({ url, init: init as never });
      return okJson([
        { name: "skill-creator", provenance: "hub", enabled: true, usage: 3 },
      ]);
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const skills = await client.listSkills();
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/skills");
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: "skill-creator", provenance: "hub" });
  });

  it("listSkills 兼容 {skills:[]} 包裹与空响应", async () => {
    const fetchImpl = (async () => okJson({ skills: [{ name: "a" }] })) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    expect(await client.listSkills()).toHaveLength(1);
    const fetchEmpty = (async () => okJson({})) as unknown as typeof fetch;
    const client2 = new HermesClient({ token: TOKEN, fetchImpl: fetchEmpty });
    expect(await client2.listSkills()).toEqual([]);
  });

  it("searchSkills 带 q 查询参数（GET /api/skills/hub/search）", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push({ url, init: {} });
      return okJson({ results: [{ identifier: "openai/skills/skill-creator", source: "github" }] });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const data = await client.searchSkills("skill-creator");
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/skills/hub/search?q=skill-creator");
    expect(data.results[0].identifier).toBe("openai/skills/skill-creator");
  });

  it("installSkill 以 POST 提交 {identifier}（hub/install）", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string; body?: string }) => {
      calls.push({ url, init: init as never });
      return okJson({ ok: true, pid: 123, name: "install-x" });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.installSkill("openai/skills/skill-creator");
    expect(res.ok).toBe(true);
    expect(res.pid).toBe(123);
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/skills/hub/install");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ identifier: "openai/skills/skill-creator" });
  });

  it("uninstallSkill 以 POST 提交 {name}", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string; body?: string }) => {
      calls.push({ url, init: init as never });
      return okJson({ ok: true, pid: 9, name: "uninstall-x" });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.uninstallSkill("video-claw");
    expect(res.ok).toBe(true);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: "video-claw" });
  });

  it("updateSkills 以 POST 触发 hub/update", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string }) => {
      calls.push({ url, init: init as never });
      return okJson({ ok: true, pid: 7, name: "skills-update" });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.updateSkills();
    expect(res.ok).toBe(true);
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/skills/hub/update");
    expect(calls[0].init.method).toBe("POST");
  });

  it("toggleSkill 以 PUT 提交 {name, enabled}", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string; body?: string }) => {
      calls.push({ url, init: init as never });
      return okJson({ ok: true, name: "video-claw", enabled: false });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.toggleSkill("video-claw", false);
    expect(res.ok).toBe(true);
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/skills/toggle");
    expect(calls[0].init.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ name: "video-claw", enabled: false });
  });

  it("setModel 以 POST 提交 ModelAssignment（含默认 task/base_url/api_key）", async () => {
    const calls: MockFetchCall[] = [];
    const fetchImpl = (async (url: string, init: { method?: string; body?: string }) => {
      calls.push({ url, init: init as never });
      return okJson({ ok: true, scope: "main", provider: "shentong", model: "qwen3.8-max" });
    }) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.setModel({ scope: "main", provider: "shentong", model: "qwen3.8-max" });
    expect(res.ok).toBe(true);
    expect(calls[0].url).toBe(HERMES_BASE_URL + "/api/model/set");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      scope: "main",
      provider: "shentong",
      model: "qwen3.8-max",
      task: "",
      base_url: "",
      api_key: "",
      confirm_expensive_model: false,
    });
  });

  it("setModel 昂贵模型返回 confirm_required 二次确认透传", async () => {
    const fetchImpl = (async () =>
      okJson({
        ok: false,
        scope: "main",
        provider: "anthropic",
        model: "claude-opus",
        confirm_required: true,
        confirm_message: "昂贵模型，确认继续？",
      })) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.setModel({ scope: "main", provider: "anthropic", model: "claude-opus" });
    expect(res.ok).toBe(false);
    expect(res.confirm_required).toBe(true);
    expect(res.confirm_message).toContain("昂贵");
  });

  it("setModel 校验失败（400）转 {ok:false,error} 不抛错", async () => {
    const fetchImpl = (async () => errResponse(400, "provider and model required for main")) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const res = await client.setModel({ scope: "main", provider: "", model: "" });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("400");
  });

  it("getModelOptions 解析选项负载", async () => {
    const fetchImpl = (async () =>
      okJson({ providers: [{ id: "shentong", label: "深瞳" }], provider: "shentong", model: "qwen3.8-max" })) as unknown as typeof fetch;
    const client = new HermesClient({ token: TOKEN, fetchImpl });
    const opts = await client.getModelOptions();
    expect(opts.provider).toBe("shentong");
    expect(opts.model).toBe("qwen3.8-max");
    expect(opts.providers).toHaveLength(1);
  });
});

/**
 * 官署产出落飞书单测（注入 fetch，不触网）
 *
 * 只写文本列是核心约束：SELECT/DATE/USER/LINK 需要飞书专有结构，硬写字符串会整条被拒
 * （RRClaw 就是在这里静默失败的），因此按规范过滤。
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { FeishuClient } from "../../electron/main/feishu-client";
import {
  appendArchiveToBoard,
  appendStrategyVersionToBoard,
  appendTaskToBoard,
  archiveRecord,
  resolveBoardTarget,
  seedStarterData,
  taskRecord,
  textFieldsOf,
} from "../../electron/main/feishu-board-writer";
import type { EdictTask } from "../../electron/shared/edict-types";

const RESOURCES_ROOT = path.join(__dirname, "..", "..", "resources");

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
  return fs.mkdtempSync(path.join(os.tmpdir(), "board-writer-"));
}

/** 造一份「一键建表」状态文件（feishu-bitable.json 是落盘格式，读它避免重复调飞书接口） */
function seedBitable(root: string): void {
  fs.writeFileSync(
    path.join(root, "feishu-bitable.json"),
    JSON.stringify({
      appToken: "app-1",
      appUrl: "https://x.feishu.cn/base/app-1",
      createdAt: "2026-09-13T00:00:00.000Z",
      tables: [
        { name: "军机处 · 任务主表（三省六部共用）", envKey: "FEISHU_TASK_MAIN_TABLE", official: "shared", tableId: "tbl-task", url: "https://x.feishu.cn/base/app-1?table=tbl-task" },
        { name: "归档索引表", envKey: "FEISHU_ARCHIVE_INDEX_TABLE", official: "shared", tableId: "tbl-arc", url: "https://x.feishu.cn/base/app-1?table=tbl-arc" },
        { name: "礼部 · 关键词表", envKey: "FEISHU_KEYWORD_TABLE", official: "libu", tableId: "tbl-kw", url: "https://x.feishu.cn/base/app-1?table=tbl-kw" },
        { name: "中书省 · 战略表", envKey: "FEISHU_STRATEGY_TABLE", official: "zhongshu", tableId: "tbl-str", url: "https://x.feishu.cn/base/app-1?table=tbl-str" },
      ],
      failed: [],
    }),
    "utf-8",
  );
}

function demoTask(): EdictTask {
  return {
    id: "JJC-20260913-001",
    title: "调研竞品",
    state: "Doing",
    org: "兵部",
    official: "兵部",
    output: "交付摘要：已输出 5 家竞品对比表。",
    block: "",
    flow_log: [{ at: "2026-09-13T01:00:00Z", from: "尚书省", to: "兵部", remark: "派发：尚书省 → 兵部" }],
    progress_log: [{ at: "2026-09-13T01:05:00Z", agent: "bingbu", text: "兵部产出：已完成竞品对比" }],
    todos: [],
    updatedAt: "2026-09-13T01:05:00Z",
  };
}

describe("feishu-board-writer", () => {
  test("未建表 ⇒ skipped（不触网、不报错）", async () => {
    const { impl, calls } = fakeFetch(() => ({ json: TOKEN }));
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await appendTaskToBoard({ dataRoot: tmpRoot(), resourcesRoot: RESOURCES_ROOT, client }, demoTask());
    expect(res.ok).toBe(false);
    expect(res.skipped).toBe(true);
    expect(calls.length).toBe(0);
  });

  test("未配凭证 ⇒ skipped", async () => {
    const root = tmpRoot();
    seedBitable(root);
    const res = await appendTaskToBoard({ dataRoot: root, resourcesRoot: RESOURCES_ROOT, client: null }, demoTask());
    expect(res.skipped).toBe(true);
  });

  test("写任务主表：只提交规范里的文本列，SELECT/日期/关联列一律不写", async () => {
    const root = tmpRoot();
    seedBitable(root);
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      return { json: { code: 0, data: { records: [{}] } } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await appendTaskToBoard({ dataRoot: root, resourcesRoot: RESOURCES_ROOT, client }, demoTask());
    expect(res.ok).toBe(true);

    const create = calls.find((c) => c.url.includes("/records/batch_create"));
    expect(create?.url).toContain("/apps/app-1/tables/tbl-task/records/batch_create");
    const fields = (create?.body as { records: Array<{ fields: Record<string, string> }> }).records[0].fields;
    expect(fields.id).toBe("JJC-20260913-001");
    expect(fields.title).toBe("调研竞品");
    expect(fields.now).toContain("已完成竞品对比");
    expect(fields.flow_log).toContain("尚书省→兵部");
    expect(fields.output).toContain("交付摘要");
    // 非文本列不提交（写错会被飞书整条拒绝）
    expect(fields.state).toBeUndefined();
    expect(fields.updatedAt).toBeUndefined();
  });

  test("归档索引表：文档编号/标题/摘要三列（摘要为规范新增文本列）", async () => {
    const root = tmpRoot();
    seedBitable(root);
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      return { json: { code: 0, data: { records: [{}] } } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await appendArchiveToBoard(
      { dataRoot: root, resourcesRoot: RESOURCES_ROOT, client },
      { taskId: "JJC-20260913-001", title: "调研竞品", agentLabel: "兵部", output: "完整产出全文" },
    );
    expect(res.ok).toBe(true);
    const create = calls.find((c) => c.url.includes("/records/batch_create"));
    expect(create?.url).toContain("/tables/tbl-arc/records/batch_create");
    const fields = (create?.body as { records: Array<{ fields: Record<string, string> }> }).records[0].fields;
    expect(fields["文档编号"]).toBe("JJC-20260913-001");
    expect(fields["文档标题"]).toContain("兵部");
    expect(fields["摘要"]).toBe("完整产出全文");
  });

  test("接口失败 ⇒ ok:false 且带错误信息（不抛异常）", async () => {
    const root = tmpRoot();
    seedBitable(root);
    const { impl } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      return { json: { code: 1254005, msg: "field not found" } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await appendTaskToBoard({ dataRoot: root, resourcesRoot: RESOURCES_ROOT, client }, demoTask());
    expect(res.ok).toBe(false);
    expect(res.skipped).toBeUndefined();
    expect(res.error).toBeTruthy();
  });

  test("规范/状态读取：文本列与目标表解析", () => {
    const root = tmpRoot();
    seedBitable(root);
    const target = resolveBoardTarget(root, "FEISHU_TASK_MAIN_TABLE");
    expect(target?.appToken).toBe("app-1");
    expect(target?.tableId).toBe("tbl-task");

    const text = textFieldsOf(RESOURCES_ROOT, "军机处 · 任务主表（三省六部共用）");
    expect(text.has("id")).toBe(true);
    expect(text.has("state")).toBe(false);

    expect(taskRecord(demoTask()).id).toBe("JJC-20260913-001");
    expect(archiveRecord({ taskId: "J1", title: "t", agentLabel: "兵部", output: "o" })["文档标题"]).toBe("t（兵部产出）");
  });
  test("战略版本记录：只写文本列（版本类型/迭代日期/变更人不写）", async () => {
    const root = tmpRoot();
    seedBitable(root);
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      return { json: { code: 0, data: { records: [{}] } } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await appendStrategyVersionToBoard(
      { dataRoot: root, resourcesRoot: RESOURCES_ROOT, client },
      { version: "V1.0", reason: "一键组队首次建档", summary: "建立战略基准", kpi: "方案一次通过率 ≥60%", execTable: "军机处·任务主表（共享）" },
    );
    expect(res.ok).toBe(true);
    const create = calls.find((c) => c.url.includes("/tables/tbl-str/records/batch_create"));
    const fields = (create?.body as { records: Array<{ fields: Record<string, string> }> }).records[0].fields;
    expect(fields["版本号"]).toBe("V1.0");
    expect(fields["变更摘要"]).toBe("建立战略基准");
    expect(fields["版本类型"]).toBeUndefined();
    expect(fields["迭代日期"]).toBeUndefined();
    expect(fields["变更人"]).toBeUndefined();
  });

  test("种子数据：空表时批量预填关键词（只写文本列）", async () => {
    const root = tmpRoot();
    seedBitable(root);
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (call.url.includes("/records/search")) return { json: { code: 0, data: { items: [], total: 0 } } };
      return { json: { code: 0, data: { records: [{}] } } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await seedStarterData({ dataRoot: root, resourcesRoot: RESOURCES_ROOT, client });
    expect(res.ok).toBe(true);
    expect(res.added).toBeGreaterThanOrEqual(10);
    const create = calls.find((c) => c.url.includes("/tables/tbl-kw/records/batch_create"));
    const records = (create?.body as { records: Array<{ fields: Record<string, string> }> }).records;
    expect(records[0].fields["关键词"]).toBeTruthy();
    expect(records[0].fields["分类"]).toBeUndefined();
  });

  test("种子数据幂等：表里已有记录就跳过", async () => {
    const root = tmpRoot();
    seedBitable(root);
    const { impl, calls } = fakeFetch((call) => {
      if (call.url.includes("tenant_access_token")) return TOKEN;
      if (call.url.includes("/records/search")) return { json: { code: 0, data: { items: [{ record_id: "rec-1" }], total: 1 } } };
      return { json: { code: 0, data: {} } };
    });
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await seedStarterData({ dataRoot: root, resourcesRoot: RESOURCES_ROOT, client });
    expect(res.ok).toBe(true);
    expect(res.skipped).toBe(true);
    expect(res.added).toBe(0);
    expect(calls.some((c) => c.url.includes("batch_create"))).toBe(false);
  });

  test("种子数据：未建表 ⇒ skipped", async () => {
    const { impl } = fakeFetch(() => ({ json: TOKEN }));
    const client = new FeishuClient({ appId: "a", appSecret: "b", fetchImpl: impl });
    const res = await seedStarterData({ dataRoot: tmpRoot(), resourcesRoot: RESOURCES_ROOT, client });
    expect(res.skipped).toBe(true);
  });
});

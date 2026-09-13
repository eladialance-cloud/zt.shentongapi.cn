/**
 * 官署详情（official-detail）单测：飞书表清单 + SOUL 占位符渲染
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_OFFICIAL_TABLES,
  SHARED_OFFICIAL_TABLES,
  getOfficialTables,
  saveOfficialTables,
  renderSoulWithTables,
  isSafeAgentId,
} from "../../electron/main/official-detail";

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "official-detail-"));
}

describe("official-detail", () => {
  test("isSafeAgentId 拦截路径穿越", () => {
    expect(isSafeAgentId("gongbu")).toBe(true);
    expect(isSafeAgentId("libu_hr")).toBe(true);
    expect(isSafeAgentId("../etc")).toBe(false);
    expect(isSafeAgentId("a/b")).toBe(false);
    expect(isSafeAgentId("")).toBe(false);
  });

  test("getOfficialTables 无配置时回退规范默认值 + 共享表", () => {
    const root = tmpRoot();
    const tables = getOfficialTables(root, "gongbu");
    const keys = tables.map((t) => t.envKey);
    expect(keys).toContain("FEISHU_CONTENT_TABLE");
    // 共享表始终展示
    for (const s of SHARED_OFFICIAL_TABLES) expect(keys).toContain(s.envKey);
    expect(tables.length).toBe(DEFAULT_OFFICIAL_TABLES.gongbu.length + SHARED_OFFICIAL_TABLES.length);
  });

  test("saveOfficialTables 后可读回（用户配置优先，仍补共享表）", () => {
    const root = tmpRoot();
    const res = saveOfficialTables(root, "bingbu", [
      { envKey: "FEISHU_SALES_TABLE", name: "兵部·业务拓展表", url: "https://x.feishu.cn/base/abc", access: "rw" },
    ]);
    expect(res.ok).toBe(true);
    const tables = getOfficialTables(root, "bingbu");
    const sales = tables.find((t) => t.envKey === "FEISHU_SALES_TABLE");
    expect(sales?.url).toBe("https://x.feishu.cn/base/abc");
    // 共享表被补齐
    expect(tables.map((t) => t.envKey)).toContain("FEISHU_TASK_MAIN_TABLE");
  });

  test("saveOfficialTables 拒绝非法 id", () => {
    const root = tmpRoot();
    const res = saveOfficialTables(root, "..", []);
    expect(res.ok).toBe(false);
  });

  test("renderSoulWithTables 替换占位符并按名称/envKey 匹配", () => {
    const soul = "表A：{{FEISHU_DOC:工部·内容生产表}}\n表B：{{FEISHU_DOC:FEISHU_CONTENT_TABLE}}\n表C：{{FEISHU_DOC:未知表}}";
    const r = renderSoulWithTables(soul, [
      { envKey: "FEISHU_CONTENT_TABLE", name: "工部·内容生产表", url: "https://l/1" },
    ]);
    expect(r.replaced).toBe(2);
    expect(r.content).toContain("https://l/1");
    expect(r.content).not.toContain("{{FEISHU_DOC:工部·内容生产表}}");
    expect(r.missing).toEqual(["未知表"]);
    // 未回填的占位保留
    expect(r.content).toContain("{{FEISHU_DOC:未知表}}");
  });

  test("renderSoulWithTables 无链接时不替换、全部计入 missing", () => {
    const r = renderSoulWithTables("{{FEISHU_DOC:军机处·任务主表}}", [
      { envKey: "FEISHU_TASK_MAIN_TABLE", name: "军机处·任务主表", url: null },
    ]);
    expect(r.replaced).toBe(0);
    expect(r.missing).toEqual(["军机处·任务主表"]);
    expect(r.content).toBe("{{FEISHU_DOC:军机处·任务主表}}");
  });
});

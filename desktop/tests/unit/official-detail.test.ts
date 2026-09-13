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
  writeRenderedSoul,
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

describe("writeRenderedSoul", () => {
  test("把蓝本占位符渲染后写入目标文件", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "st-soul-"));
    const src = path.join(root, "zhongshu.md");
    const dst = path.join(root, "profile", "SOUL.md");
    fs.writeFileSync(src, "# 中书省\n| 表 | 链接 |\n| 方案表 | {{FEISHU_DOC:中书省·方案表}} |", "utf-8");
    const r = writeRenderedSoul(src, dst, [
      { envKey: "FEISHU_PLAN_TABLE", name: "中书省·方案表", url: "https://feishu.cn/base/abc" },
    ]);
    expect(r.ok).toBe(true);
    expect(r.replaced).toBe(1);
    expect(fs.readFileSync(dst, "utf-8")).toContain("https://feishu.cn/base/abc");
    expect(fs.readFileSync(dst, "utf-8")).not.toContain("{{FEISHU_DOC:");
  });

  test("没有链接时保留占位符并计入 missing（不伪造链接）", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "st-soul-"));
    const src = path.join(root, "bingbu.md");
    const dst = path.join(root, "profile", "SOUL.md");
    fs.writeFileSync(src, "{{FEISHU_DOC:兵部·业务拓展表}}", "utf-8");
    const r = writeRenderedSoul(src, dst, []);
    expect(r.ok).toBe(true);
    expect(r.replaced).toBe(0);
    expect(r.missing).toContain("兵部·业务拓展表");
    expect(fs.readFileSync(dst, "utf-8")).toContain("{{FEISHU_DOC:兵部·业务拓展表}}");
  });

  test("蓝本缺失时返回错误且不写目标文件", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "st-soul-"));
    const dst = path.join(root, "profile", "SOUL.md");
    const r = writeRenderedSoul(path.join(root, "nope.md"), dst, []);
    expect(r.ok).toBe(false);
    expect(r.error).toContain("蓝本 SOUL 不存在");
    expect(fs.existsSync(dst)).toBe(false);
  });
});

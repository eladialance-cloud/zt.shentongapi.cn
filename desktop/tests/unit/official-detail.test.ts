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

describe("官署蓝本 ↔ 表清单一致性（一键组队回填后无孤立占位符）", () => {
  const PROFILE_DIR = path.join(__dirname, "../../resources/edict/profiles");
  const AGENTS = Object.keys(DEFAULT_OFFICIAL_TABLES);

  test("每个官署蓝本的 {{FEISHU_DOC:}} 占位符都能被本官署表清单解析", () => {
    const root = tmpRoot();
    // 模拟一键组队回填（对标 feishu-bitable.initBitable）：无主共享表写全部官署，
    // 有主共享表只由主写官署回填，其余官署靠 collectKnownUrls 借用链接
    for (const agent of AGENTS) {
      const rows = [
        ...(DEFAULT_OFFICIAL_TABLES[agent] ?? []),
        ...SHARED_OFFICIAL_TABLES.filter((t) => !t.owner),
      ].map((t) => ({ ...t, url: "https://x.feishu.cn/base/" + t.envKey }));
      saveOfficialTables(root, agent, rows);
    }
    expect(AGENTS.length).toBe(12);
    for (const agent of AGENTS) {
      const soul = fs.readFileSync(path.join(PROFILE_DIR, agent + ".md"), "utf-8");
      const r = renderSoulWithTables(soul, getOfficialTables(root, agent));
      expect({ agent, missing: r.missing }).toEqual({ agent, missing: [] });
      expect(r.replaced).toBeGreaterThan(0);
      expect(r.content).not.toContain("{{FEISHU_DOC:");
    }
  });

  test("共享表链接跨官署复用：非主写官署也能拿到链接且权限为只读", () => {
    const root = tmpRoot();
    saveOfficialTables(root, "hubu", [{ envKey: "FEISHU_FINANCE_TABLE", name: "户部·财务收支表", url: "https://l/hubu", access: "rw" }]);
    const gongbu = getOfficialTables(root, "gongbu");
    const finance = gongbu.find((t) => t.envKey === "FEISHU_FINANCE_TABLE");
    expect(finance?.url).toBe("https://l/hubu");
    expect(finance?.access).toBe("read");
    const own = getOfficialTables(root, "hubu").find((t) => t.envKey === "FEISHU_FINANCE_TABLE");
    expect(own?.access).toBe("rw");
  });

  test("保存链接不丢共享关系：owner/shared 会被持久化，再次读回仍标共享且权限正确", () => {
    const root = tmpRoot();
    // 非主写官署（工部）保存自己看到的清单：共享表应保留 owner/shared，且自身仍是只读
    saveOfficialTables(root, "gongbu", getOfficialTables(root, "gongbu"));
    const gongbu = getOfficialTables(root, "gongbu");
    const hr = gongbu.find((t) => t.envKey === "FEISHU_HR_TABLE");
    expect(hr?.shared).toBe(true);
    expect(hr?.owner).toBe("libu_hr");
    expect(hr?.access).toBe("read");
    const metrics = gongbu.find((t) => t.envKey === "FEISHU_METRICS_TABLE");
    expect(metrics?.shared).toBe(true);
    expect(metrics?.access).toBe("read");

    // 主写官署（吏部）保存后，自己那张表仍是读写
    saveOfficialTables(root, "libu_hr", getOfficialTables(root, "libu_hr"));
    const own = getOfficialTables(root, "libu_hr").find((t) => t.envKey === "FEISHU_HR_TABLE");
    expect(own?.owner).toBe("libu_hr");
    expect(own?.access).toBe("rw");
  });

  test("非法 owner 不落盘（防路径注入），读回时以共享矩阵的规范 owner 为准", () => {
    const root = tmpRoot();
    saveOfficialTables(root, "gongbu", [
      { envKey: "FEISHU_HR_TABLE", name: "吏部·人事绩效表", owner: "../etc", access: "read" },
    ]);
    const saved = JSON.parse(
      fs.readFileSync(path.join(root, "official-tables.json"), "utf-8"),
    ) as { gongbu: { tables: Array<{ envKey: string; owner?: string }> } };
    const persisted = saved.gongbu.tables.find((t) => t.envKey === "FEISHU_HR_TABLE");
    expect(persisted?.owner).not.toBe("../etc");
    // 读回时共享矩阵给出规范 owner（吏部主写），工部仍只读
    const hr = getOfficialTables(root, "gongbu").find((t) => t.envKey === "FEISHU_HR_TABLE");
    expect(hr?.owner).toBe("libu_hr");
    expect(hr?.access).toBe("read");
  });
});

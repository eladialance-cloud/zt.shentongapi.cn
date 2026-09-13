/**
 * 官署详情 — 飞书表映射（official-detail）
 *
 * 对标 RRClaw 的「多维表格占位符 → 真实表链接」机制：
 * 每个官署的 SOUL.md 用 {{FEISHU_DOC:xx}} 占位，本模块维护「官署 → 表清单（名称/env 键/链接）」映射，
 * 落盘 <userData>/edict-data/official-tables.json。当前深瞳尚未接入飞书 API，
 * 此处先做「表清单与链接」单一真源 + 规范默认值，后续飞书集成直接消费本文件（替换占位符）。
 *
 * 纯函数 + 依赖注入，便于单测。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { ipcMain } from "electron";

export interface OfficialTableEntry {
  /** .env / SOUL 占位符使用的键名（如 FEISHU_TASK_MAIN_TABLE） */
  envKey: string;
  /** 表中文名（如「军机处·任务主表」） */
  name: string;
  /** 飞书多维表格链接（可空，未配置时前端提示待回填） */
  url?: string | null;
  /** 该官署对该表的权限（读写/只读/写入） */
  access?: "rw" | "read" | "write";
  /** 主写官署 id（共享表用）：非空表示「该官署读写、其余官署按 access 只读」 */
  owner?: string;
  /** 共享表标记（详情页标注「共享」） */
  shared?: boolean;
}

export interface OfficialTableConfig {
  agentId: string;
  tables: OfficialTableEntry[];
  updatedAt: string;
}

/** 每个官署的规范默认表（来自 resources/edict/data/多维表格字段设计规范.md；1 个官署 N 张表，对标 RRClaw） */
export const DEFAULT_OFFICIAL_TABLES: Record<string, OfficialTableEntry[]> = {
  taizi: [{ envKey: "FEISHU_MSG_TRIAGE_TABLE", name: "太子·消息分拣表", access: "rw" }],
  zhongshu: [
    { envKey: "FEISHU_PLAN_TABLE", name: "中书省·方案表", access: "rw" },
    // 战略方向文档由中书省牵头维护（一键组队第 5 步创建/复用）
    { envKey: "FEISHU_STRATEGY_DOC", name: "战略方向文档", access: "rw" },
    { envKey: "FEISHU_STRATEGY_TABLE", name: "中书省·战略表", access: "rw" },
  ],
  menxia: [{ envKey: "FEISHU_AUDIT_TABLE", name: "门下省·审核记录表", access: "rw" }],
  shangshu: [{ envKey: "FEISHU_DISPATCH_TABLE", name: "尚书省·派发执行汇总表", access: "rw" }],
  libu: [
    { envKey: "FEISHU_INTEL_TABLE", name: "礼部·数据情报表", access: "rw" },
    { envKey: "FEISHU_KEYWORD_TABLE", name: "礼部·关键词表", access: "rw" },
    { envKey: "FEISHU_HOT_CONTENT_TABLE", name: "礼部·爆款采集表", access: "rw" },
  ],
  hubu: [{ envKey: "FEISHU_FINANCE_TABLE", name: "户部·财务收支表", access: "rw" }],
  libu_hr: [{ envKey: "FEISHU_HR_TABLE", name: "吏部·人事绩效表", access: "rw" }],
  bingbu: [
    { envKey: "FEISHU_SALES_TABLE", name: "兵部·业务拓展表", access: "rw" },
    { envKey: "FEISHU_CUSTOMER_TABLE", name: "兵部·客户档案表", access: "rw" },
    { envKey: "FEISHU_FOLLOWUP_TABLE", name: "兵部·客户跟进表", access: "rw" },
    { envKey: "FEISHU_COMMUNITY_TABLE", name: "兵部·社群运营表", access: "rw" },
    { envKey: "FEISHU_CHANNEL_TABLE", name: "兵部·渠道触达表", access: "rw" },
  ],
  xingbu: [{ envKey: "FEISHU_COMPLIANCE_TABLE", name: "刑部·合规审查表", access: "rw" }],
  gongbu: [
    { envKey: "FEISHU_CONTENT_TABLE", name: "工部·内容生产表", access: "rw" },
    { envKey: "FEISHU_DAILY_POSTER_TABLE", name: "工部·每日海报表", access: "rw" },
    { envKey: "FEISHU_COPYWRITING_TABLE", name: "工部·文案库", access: "rw" },
  ],
  qintianjian: [{ envKey: "FEISHU_METRICS_TABLE", name: "钦天监·度量报表", access: "rw" }],
  zaochao: [{ envKey: "FEISHU_BRIEF_MATERIAL_TABLE", name: "早朝简报·每日简报素材表", access: "rw" }],
};

/**
 * 全员共享表（每个官署详情页都会展示，对标 RRClaw 的 12 张共享表）。
 * owner = 主写官署：该官署读写，其余官署按 access 只读；缺省（无 owner）表示全员读写。
 */
export const SHARED_OFFICIAL_TABLES: OfficialTableEntry[] = [
  { envKey: "FEISHU_TASK_MAIN_TABLE", name: "军机处·任务主表（共享）", access: "rw", shared: true },
  { envKey: "FEISHU_ARCHIVE_INDEX_TABLE", name: "归档索引表（共享）", access: "read", shared: true },
  { envKey: "FEISHU_STRATEGY_DOC", name: "战略方向文档", access: "read", owner: "zhongshu", shared: true },
  { envKey: "FEISHU_HR_TABLE", name: "吏部·人事绩效表", access: "read", owner: "libu_hr", shared: true },
  { envKey: "FEISHU_METRICS_TABLE", name: "钦天监·度量报表", access: "read", owner: "qintianjian", shared: true },
  { envKey: "FEISHU_FINANCE_TABLE", name: "户部·财务收支表", access: "read", owner: "hubu", shared: true },
];

const SAFE_AGENT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function isSafeAgentId(agentId: string): boolean {
  return SAFE_AGENT_ID_RE.test(agentId);
}

function configFile(dataRoot: string): string {
  return path.join(dataRoot, "official-tables.json");
}

function readAll(dataRoot: string): Record<string, OfficialTableConfig> {
  const file = configFile(dataRoot);
  try {
    if (!fs.existsSync(file)) return {};
    const raw = fs.readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(dataRoot: string, data: Record<string, OfficialTableConfig>): void {
  const file = configFile(dataRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

/** 全官署已回填的 envKey → url：共享表由主写官署回填后，其余官署也能拿到同一条链接 */
function collectKnownUrls(dataRoot: string): Map<string, string> {
  const urls = new Map<string, string>();
  const all = readAll(dataRoot);
  for (const cfg of Object.values(all)) {
    for (const t of cfg?.tables ?? []) {
      if (t?.envKey && t.url && !urls.has(t.envKey)) urls.set(t.envKey, t.url);
    }
  }
  return urls;
}

/** 规范一条表项：按「主写官署」定权限；本官署没链接时用其它官署已回填的链接兜底 */
function normalizeEntry(
  entry: OfficialTableEntry,
  agentId: string,
  urls: Map<string, string>,
): OfficialTableEntry {
  const access = entry.owner ? (entry.owner === agentId ? "rw" : entry.access ?? "read") : entry.access ?? "rw";
  return { ...entry, access, url: entry.url || urls.get(entry.envKey) || null };
}

/** 该官署对某表的规范默认权限（回填新增表时保持「只读表仍只读」） */
export function defaultTableAccess(agentId: string, envKey: string): "rw" | "read" | "write" {
  const own = (DEFAULT_OFFICIAL_TABLES[agentId] ?? []).find((t) => t.envKey === envKey);
  if (own) return own.access ?? "rw";
  const shared = SHARED_OFFICIAL_TABLES.find((t) => t.envKey === envKey);
  if (shared) return shared.owner && shared.owner !== agentId ? shared.access ?? "read" : shared.access ?? "rw";
  return "rw";
}

/**
 * 读取某官署的表清单：用户配置优先，缺省回退规范默认值 + 共享表。
 * - 用户配置里缺的规范新表会补齐（否则老装机新增表永远拿不到链接与展示项）
 * - 共享表始终展示；同名表以用户配置为准
 */
export function getOfficialTables(dataRoot: string, agentId: string): OfficialTableEntry[] {
  if (!isSafeAgentId(agentId)) return [];
  const all = readAll(dataRoot);
  const saved = all[agentId]?.tables;
  const defaults = DEFAULT_OFFICIAL_TABLES[agentId] ?? [];
  const urls = collectKnownUrls(dataRoot);
  const byKey = new Map<string, OfficialTableEntry>();
  for (const t of saved && saved.length ? saved : defaults) byKey.set(t.envKey, t);
  for (const t of defaults) if (!byKey.has(t.envKey)) byKey.set(t.envKey, t);
  for (const t of SHARED_OFFICIAL_TABLES) if (!byKey.has(t.envKey)) byKey.set(t.envKey, t);
  // 共享矩阵是「叠加信息」：主写官署自己那张专属表也要标成共享 + 带 owner
  // （否则主写官署页面上看不到「这张表是全员共享的」，其余官署的只读判定也失去基准）
  const sharedByKey = new Map(SHARED_OFFICIAL_TABLES.map((t) => [t.envKey, t]));
  return Array.from(byKey.values()).map((t) => {
    const sh = sharedByKey.get(t.envKey);
    const merged: OfficialTableEntry = sh
      ? { ...t, shared: true, ...(sh.owner ? { owner: sh.owner } : {}) }
      : t;
    return normalizeEntry(merged, agentId, urls);
  });
}

/** 保存某官署的表清单（整表覆盖） */
export function saveOfficialTables(
  dataRoot: string,
  agentId: string,
  tables: OfficialTableEntry[],
): { ok: boolean; error?: string } {
  if (!isSafeAgentId(agentId)) return { ok: false, error: "非法官署 id" };
  if (!Array.isArray(tables)) return { ok: false, error: "表清单格式错误" };
  const cleaned: OfficialTableEntry[] = [];
  for (const t of tables) {
    if (!t || typeof t !== "object") continue;
    const envKey = typeof t.envKey === "string" ? t.envKey.trim() : "";
    const name = typeof t.name === "string" ? t.name.trim() : "";
    if (!envKey || !name) continue;
    const url = typeof t.url === "string" ? t.url.trim() : "";
    // owner/shared 必须持久化：否则前端「保存链接」一次，共享关系与主写官署就被抹掉
    const owner = typeof t.owner === "string" && isSafeAgentId(t.owner.trim()) ? t.owner.trim() : undefined;
    cleaned.push({
      envKey,
      name,
      url: url || null,
      access: t.access === "read" || t.access === "write" ? t.access : owner ? "read" : "rw",
      ...(owner ? { owner } : {}),
      ...(t.shared === true ? { shared: true } : {}),
    });
  }
  try {
    const all = readAll(dataRoot);
    all[agentId] = { agentId, tables: cleaned, updatedAt: new Date().toISOString() };
    writeAll(dataRoot, all);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 占位符替换：把 SOUL.md 中的 {{FEISHU_DOC:<名称或envKey>}} 替换为真实链接（无链接则保留占位） */
export function renderSoulWithTables(
  soul: string,
  tables: OfficialTableEntry[],
): { content: string; replaced: number; missing: string[] } {
  const byName = new Map<string, string>();
  for (const t of tables) {
    if (t.url) {
      byName.set(t.name, t.url);
      byName.set(t.envKey, t.url);
    }
  }
  let replaced = 0;
  const missing: string[] = [];
  const content = soul.replace(/\{\{FEISHU_DOC:([^}]+)\}\}/g, (_m, key: string) => {
    const k = String(key).trim();
    const url = byName.get(k);
    if (url) {
      replaced += 1;
      return url;
    }
    missing.push(k);
    return `{{FEISHU_DOC:${k}}}`;
  });
  return { content, replaced, missing };
}

/**
 * 用蓝本 SOUL 渲染占位符后写入 profile（唯一的 SOUL 写入入口）。
 * 启动引导（edict-bridge）与一键组队（team-ipc）都走这里，避免两套写法互相覆盖：
 * 曾经启动引导直接 copyFileSync 蓝本，把已渲染的飞书链接冲回占位符。
 */
export function writeRenderedSoul(
  soulSrcFile: string,
  soulDstFile: string,
  tables: OfficialTableEntry[],
): { ok: boolean; replaced: number; missing: string[]; error?: string } {
  try {
    if (!fs.existsSync(soulSrcFile)) {
      return { ok: false, replaced: 0, missing: [], error: `蓝本 SOUL 不存在：${soulSrcFile}` };
    }
    const soul = fs.readFileSync(soulSrcFile, "utf-8");
    const rendered = renderSoulWithTables(soul, tables);
    fs.mkdirSync(path.dirname(soulDstFile), { recursive: true });
    fs.writeFileSync(soulDstFile, rendered.content, "utf-8");
    return { ok: true, replaced: rendered.replaced, missing: rendered.missing };
  } catch (err) {
    return { ok: false, replaced: 0, missing: [], error: err instanceof Error ? err.message : String(err) };
  }
}

// ===== IPC 注册（官署详情三 tab：飞书表 / 定时任务 / 执行日志；定时任务与日志由渲染层走既有 API） =====

export interface OfficialDetailIpcDeps {
  /** edict 可写运行时根（userData/edict-data） */
  dataRoot: string;
  /** 读取官署 SOUL.md（自定义覆盖优先，回退蓝本）；返回 null 表示不存在 */
  readSoul: (agentId: string) => string | null;
}

/** 注册 edict:official-* IPC；返回 dispose */
export function registerOfficialDetailIpc(deps: OfficialDetailIpcDeps): () => void {
  // 飞书表清单（单官署）
  ipcMain.handle("edict:official-tables", (_e, agentId: unknown) => {
    const id = typeof agentId === "string" ? agentId.trim() : "";
    if (!isSafeAgentId(id)) return { ok: false, error: "非法官署 id" };
    return { ok: true, tables: getOfficialTables(deps.dataRoot, id) };
  });
  // 保存飞书表清单
  ipcMain.handle("edict:save-official-tables", (_e, agentId: unknown, tables: unknown) => {
    const id = typeof agentId === "string" ? agentId.trim() : "";
    if (!isSafeAgentId(id)) return { ok: false, error: "非法官署 id" };
    return saveOfficialTables(deps.dataRoot, id, (tables as OfficialTableEntry[]) ?? []);
  });
  // 官署详情聚合：SOUL 原文 + 占位符渲染预览（供「飞书表」tab 联动）
  ipcMain.handle("edict:official-soul", (_e, agentId: unknown) => {
    const id = typeof agentId === "string" ? agentId.trim() : "";
    if (!isSafeAgentId(id)) return { ok: false, error: "非法官署 id" };
    const soul = deps.readSoul(id);
    if (soul == null) return { ok: false, error: "未找到该官署的 SOUL.md" };
    const tables = getOfficialTables(deps.dataRoot, id);
    const rendered = renderSoulWithTables(soul, tables);
    return {
      ok: true,
      agentId: id,
      content: soul,
      rendered: rendered.content,
      replaced: rendered.replaced,
      missing: rendered.missing,
      tables,
    };
  });

  return () => {
    for (const ch of ["edict:official-tables", "edict:save-official-tables", "edict:official-soul"]) {
      try {
        ipcMain.removeHandler(ch);
      } catch {
        // 忽略重复移除
      }
    }
  };
}

/**
 * 飞书多维表格初始化（feishu-bitable）
 *
 * 对标 RRClaw 的「一键创建多维表格」：解析《多维表格字段设计规范.md》→ 建多维表格应用
 * → 逐表建数据表 → 回填各官署表链接（official-tables.json）。
 *
 * 单一真源：字段结构来自 resources/edict/data/多维表格字段设计规范.md，本模块负责解析 + 建表，
 * 不硬编码字段（新增官署/表只需改规范 md）。
 *
 * 纯函数 + 依赖注入，便于单测（不 import electron）。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { FeishuClient } from "./feishu-client";
import type { FeishuResult } from "./feishu-client";
import { getOfficialTables, saveOfficialTables } from "./official-detail";

/** 规范字段类型 → 飞书多维表格字段 type 编号 */
export const FEISHU_FIELD_TYPE: Record<string, number> = {
  TEXT: 1,
  NUM: 2,
  SELECT: 3,
  MULTI: 4,
  DATE: 5,
  CHECK: 7,
  USER: 11,
  LINK: 15,
  FILE: 17,
  RELATE: 18,
  LOOKUP: 19,
  FORMULA: 20,
  RATING: 21,
};

/** 表名 → env 键（决定回填到哪个官署的哪张表）；键为规范化表名 */
export const TABLE_ENV_KEY: Record<string, string> = {
  "军机处·任务主表": "FEISHU_TASK_MAIN_TABLE",
  "太子·消息分拣表": "FEISHU_MSG_TRIAGE_TABLE",
  "中书省·方案表": "FEISHU_PLAN_TABLE",
  "门下省·审核记录表": "FEISHU_AUDIT_TABLE",
  "尚书省·派发执行汇总表": "FEISHU_DISPATCH_TABLE",
  "兵部·业务拓展表": "FEISHU_SALES_TABLE",
  "工部·内容生产表": "FEISHU_CONTENT_TABLE",
  "户部·财务收支表": "FEISHU_FINANCE_TABLE",
  "吏部·人事绩效表": "FEISHU_HR_TABLE",
  "礼部·数据情报表": "FEISHU_INTEL_TABLE",
  "刑部·合规审查表": "FEISHU_COMPLIANCE_TABLE",
  "钦天监·度量报表": "FEISHU_METRICS_TABLE",
  "早朝简报·每日简报素材表": "FEISHU_BRIEF_MATERIAL_TABLE",
  归档索引表: "FEISHU_ARCHIVE_INDEX_TABLE",
};

/** 规范化表名：去掉括注（…）与全部空白，仅保留「主体·表名」 */
export function normalizeTableName(name: string): string {
  return (name || "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s\u3000]+/g, "")
    .trim();
}

/** env 键 → 归属官署 id（shared 表示全员共享表） */
export const ENV_KEY_OWNER: Record<string, string> = {
  FEISHU_TASK_MAIN_TABLE: "shared",
  FEISHU_MSG_TRIAGE_TABLE: "taizi",
  FEISHU_PLAN_TABLE: "zhongshu",
  FEISHU_AUDIT_TABLE: "menxia",
  FEISHU_DISPATCH_TABLE: "shangshu",
  FEISHU_SALES_TABLE: "bingbu",
  FEISHU_CONTENT_TABLE: "gongbu",
  FEISHU_FINANCE_TABLE: "hubu",
  FEISHU_HR_TABLE: "libu_hr",
  FEISHU_INTEL_TABLE: "libu",
  FEISHU_COMPLIANCE_TABLE: "xingbu",
  FEISHU_METRICS_TABLE: "qintianjian",
  FEISHU_BRIEF_MATERIAL_TABLE: "zaochao",
  FEISHU_ARCHIVE_INDEX_TABLE: "shared",
};

/** 非数据表章节（解析时跳过） */
const SKIP_SECTIONS = new Set(["字段类型说明", "通用字段约定", "附录 · 数据表创建清单（摘要）"]);

export interface ParsedField {
  name: string;
  /** 规范类型标识（TEXT/NUM/...） */
  typeLabel: string;
  /** 飞书字段 type 编号 */
  type: number;
  required: boolean;
}

export interface ParsedTable {
  /** 章节标题，如「工部 · 内容生产表」 */
  name: string;
  fields: ParsedField[];
}

function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/** 解析规范 md 为数据表定义数组（跳过字段类型说明/通用约定/附录） */
export function parseSpecMarkdown(mdText: string): ParsedTable[] {
  const lines = (mdText || "").split(/\r?\n/);
  const tables: ParsedTable[] = [];
  let current: ParsedTable | null = null;

  for (const line of lines) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      const title = h[1].trim();
      current = SKIP_SECTIONS.has(title) ? null : { name: title, fields: [] };
      if (current) tables.push(current);
      continue;
    }
    if (!current) continue;
    const cells = splitRow(line);
    if (cells.length < 4) continue;
    // 跳过表头与分隔行
    if (cells[0] === "字段名" || /^-+$/.test(cells[0])) continue;
    // 字段名须像字段（排除无意义行）
    const fieldName = cells[0];
    if (!fieldName) continue;
    const typeLabel = (cells[1] || "").toUpperCase();
    const required = cells[2] === "是";
    const type = FEISHU_FIELD_TYPE[typeLabel] ?? 1;
    current.fields.push({ name: fieldName, typeLabel, type, required });
  }
  return tables.filter((t) => t.fields.length > 0);
}

/** 读取规范 md 文本（打包后 resources 只读，dev 走 cwd/resources） */
export function readSpecMarkdown(resourcesRoot: string): string {
  const candidate = path.join(resourcesRoot, "edict", "data", "多维表格字段设计规范.md");
  try {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf-8");
  } catch {
    // 忽略，返回空
  }
  return "";
}

// ===== 建表编排 =====

export interface BitableInitProgress {
  step: string;
  message?: string;
}

export interface CreatedTable {
  name: string;
  envKey: string;
  official: string;
  tableId: string;
  url: string;
}

export interface BitableInitResult {
  ok: boolean;
  appToken?: string;
  appUrl?: string;
  tables?: CreatedTable[];
  failed?: Array<{ name: string; error: string }>;
  error?: string;
}

export interface BitableInitDeps {
  client: FeishuClient;
  dataRoot: string;
  resourcesRoot: string;
  appName?: string;
  /** 可选的进度回调 */
  onProgress?: (p: BitableInitProgress) => void;
  /** 可注入 md 文本（单测），缺省读规范文件 */
  specMarkdown?: string;
}

const BITABLE_STATE_FILE = "feishu-bitable.json";

function writeState(dataRoot: string, state: unknown): void {
  try {
    const f = path.join(dataRoot, BITABLE_STATE_FILE);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // 忽略持久化失败（不影响建表结果返回）
  }
}

/**
 * 一键创建多维表格：建 app → 逐表建表 → 回填官署表链接。
 * 单表失败不中断（记录到 failed），返回汇总。
 */
export async function initBitable(deps: BitableInitDeps): Promise<BitableInitResult> {
  const { client, dataRoot } = deps;
  if (!client.isConfigured()) {
    return { ok: false, error: "飞书凭证未配置，请先在「平台设置 → 飞书」填写 App ID / App Secret" };
  }
  const md = deps.specMarkdown ?? readSpecMarkdown(deps.resourcesRoot);
  const parsed = parseSpecMarkdown(md);
  if (parsed.length === 0) {
    return { ok: false, error: "未能从字段设计规范中解析出任何数据表（规范文件缺失或格式异常）" };
  }

  deps.onProgress?.({ step: "app", message: "创建多维表格应用…" });
  const appRes = await client.createBitableApp(deps.appName || "深瞳AI · 三省六部工作台");
  if (!appRes.ok || !appRes.data) {
    return { ok: false, error: appRes.error || "创建多维表格应用失败", };
  }
  const appToken = appRes.data.app_token;
  const appUrl = appRes.data.url || FeishuClient.bitableUrl(appToken);

  const created: CreatedTable[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const tbl of parsed) {
    deps.onProgress?.({ step: "table", message: `建表：${tbl.name}` });
    const res: FeishuResult<{ table_id: string }> = await client.createTable(
      appToken,
      tbl.name,
      tbl.fields.map((f) => ({ field_name: f.name, type: f.type })),
    );
    if (!res.ok || !res.data) {
      failed.push({ name: tbl.name, error: res.error || "建表失败" });
      continue;
    }
    const tableId = res.data.table_id;
    const url = `${FeishuClient.bitableUrl(appToken)}?table=${tableId}`;
    const envKey = TABLE_ENV_KEY[normalizeTableName(tbl.name)] || "";
    const official = ENV_KEY_OWNER[envKey] || "shared";
    created.push({ name: tbl.name, envKey, official, tableId, url });
  }

  // 回填各官署表链接（shared 表写入全部官署）
  deps.onProgress?.({ step: "bind", message: "回填官署表链接…" });
  const byOfficial = new Map<string, CreatedTable[]>();
  for (const t of created) {
    const owners = t.official === "shared" ? ALL_OFFICIAL_IDS : [t.official];
    for (const o of owners) {
      if (!byOfficial.has(o)) byOfficial.set(o, []);
      byOfficial.get(o)!.push(t);
    }
  }
  for (const [official, list] of byOfficial) {
    const current = getOfficialTables(dataRoot, official);
    const merged = current.map((entry) => {
      const hit = list.find((c) => c.envKey === entry.envKey);
      return hit ? { ...entry, url: hit.url } : entry;
    });
    saveOfficialTables(dataRoot, official, merged);
  }

  writeState(dataRoot, {
    appToken,
    appUrl,
    createdAt: new Date().toISOString(),
    tables: created,
    failed,
  });

  deps.onProgress?.({ step: "done", message: `完成：成功 ${created.length} 张，失败 ${failed.length} 张` });
  return { ok: true, appToken, appUrl, tables: created, failed };
}

const ALL_OFFICIAL_IDS = [
  "taizi", "zhongshu", "menxia", "shangshu", "libu", "hubu",
  "libu_hr", "bingbu", "xingbu", "gongbu", "zaochao", "qintianjian",
];

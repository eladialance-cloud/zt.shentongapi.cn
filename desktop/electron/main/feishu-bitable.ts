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
import { defaultTableAccess, getOfficialTables, saveOfficialTables } from "./official-detail";

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

/**
 * 飞书要求「额外 property」的字段类型：关联(18) / 查找引用(19) / 公式(20)。
 * 我们的字段规范里没有描述「关联到哪张表」「公式表达式是什么」，直接提交会被飞书拒绝，
 * 且**整张表的建表请求会一起失败**（「军机处·任务主表」就是这么整张丢的）。
 * 因此这些类型统一降级为文本：字段名与含义不丢，表能正常建出来。
 */
export const NEEDS_PROPERTY_FIELD_TYPES = new Set<number>([18, 19, 20]);

/** 规范类型 → 实际可提交给飞书的类型（缺 property 的类型降级为文本） */
export function degradeFieldType(type: number): number {
  return NEEDS_PROPERTY_FIELD_TYPES.has(type) ? FEISHU_FIELD_TYPE.TEXT : type;
}

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
  "中书省·战略表": "FEISHU_STRATEGY_TABLE",
  "礼部·关键词表": "FEISHU_KEYWORD_TABLE",
  "礼部·爆款采集表": "FEISHU_HOT_CONTENT_TABLE",
  "兵部·客户档案表": "FEISHU_CUSTOMER_TABLE",
  "兵部·客户跟进表": "FEISHU_FOLLOWUP_TABLE",
  "兵部·社群运营表": "FEISHU_COMMUNITY_TABLE",
  "兵部·渠道触达表": "FEISHU_CHANNEL_TABLE",
  "工部·每日海报表": "FEISHU_DAILY_POSTER_TABLE",
  "工部·文案库": "FEISHU_COPYWRITING_TABLE",
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
  FEISHU_STRATEGY_TABLE: "zhongshu",
  FEISHU_KEYWORD_TABLE: "libu",
  FEISHU_HOT_CONTENT_TABLE: "libu",
  FEISHU_CUSTOMER_TABLE: "bingbu",
  FEISHU_FOLLOWUP_TABLE: "bingbu",
  FEISHU_COMMUNITY_TABLE: "bingbu",
  FEISHU_CHANNEL_TABLE: "bingbu",
  FEISHU_DAILY_POSTER_TABLE: "gongbu",
  FEISHU_COPYWRITING_TABLE: "gongbu",
  FEISHU_ARCHIVE_INDEX_TABLE: "shared",
};

/** 非数据表章节（解析时跳过） */
const SKIP_SECTIONS = new Set(["字段类型说明", "通用字段约定", "附录 · 数据表创建清单（摘要）"]);

export interface ParsedField {
  name: string;
  /** 规范类型标识（TEXT/NUM/...） */
  typeLabel: string;
  /** 实际提交给飞书的字段 type 编号（可能被降级） */
  type: number;
  /** 规范原本要求的 type 编号（降级前，便于排查） */
  requestedType: number;
  /** 是否因缺少 property 被降级为文本 */
  degraded: boolean;
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
    const requestedType = FEISHU_FIELD_TYPE[typeLabel] ?? FEISHU_FIELD_TYPE.TEXT;
    const type = degradeFieldType(requestedType);
    current.fields.push({
      name: fieldName,
      typeLabel,
      type,
      requestedType,
      degraded: type !== requestedType,
      required,
    });
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
  /** true = 复用了已保存的工作台（本次未新建 app） */
  reused?: boolean;
  /** 本次新建的数据表数量 */
  createdCount?: number;
  /** 本次复用（已存在）的数据表数量 */
  reusedCount?: number;
  /** 因飞书拒绝而未能创建的字段（表本身已建出） */
  droppedFields?: Array<{ table: string; field: string; error: string }>;
  error?: string;
}

export interface BitableInitDeps {
  client: FeishuClient;
  dataRoot: string;
  resourcesRoot: string;
  appName?: string;
  /** true = 忽略已保存的工作台，强制新建一份 */
  force?: boolean;
  /** 可选的进度回调 */
  onProgress?: (p: BitableInitProgress) => void;
  /** 可注入 md 文本（单测），缺省读规范文件 */
  specMarkdown?: string;
}

const BITABLE_STATE_FILE = "feishu-bitable.json";

export interface BitableState {
  appToken: string;
  appUrl: string;
  createdAt: string;
  tables: CreatedTable[];
  failed: Array<{ name: string; error: string }>;
  droppedFields?: Array<{ table: string; field: string; error: string }>;
}

/** 读取已保存的多维表格状态（无记录 / 损坏 ⇒ null） */
export function readBitableState(dataRoot: string): BitableState | null {
  try {
    const f = path.join(dataRoot, BITABLE_STATE_FILE);
    if (!fs.existsSync(f)) return null;
    const parsed = JSON.parse(fs.readFileSync(f, "utf-8")) as BitableState;
    if (!parsed || typeof parsed.appToken !== "string" || !parsed.appToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

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
 * 一键创建/补齐多维表格：优先复用已保存的工作台 → 缺哪张表才建哪张 → 回填官署表链接。
 * - 默认复用：不会因为重跑而多出一份工作台（force=true 才强制重建）
 * - 单表失败不中断（记录到 failed）
 * - 整表被飞书拒绝时退化为「逐字段补齐」，把失败范围缩小到单个字段
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

  // ===== 1) 先查：已有工作台就复用，避免每次重跑都新建一份 =====
  let appToken = "";
  let appUrl = "";
  let reusedApp = false;
  const existing = new Map<string, string>(); // 规范化表名 → table_id
  const prior = readBitableState(dataRoot);
  if (!deps.force && prior) {
    deps.onProgress?.({ step: "reuse", message: "检测到已有多维表格，正在读取现有数据表…" });
    const list = await client.listTables(prior.appToken);
    if (list.ok && list.data) {
      appToken = prior.appToken;
      appUrl = prior.appUrl || FeishuClient.bitableUrl(prior.appToken);
      reusedApp = true;
      for (const t of list.data) {
        if (t.table_id) existing.set(normalizeTableName(t.name), t.table_id);
      }
    } else {
      deps.onProgress?.({ step: "reuse", message: "已保存的多维表格不可访问，将重新创建…" });
    }
  }

  // ===== 2) 建工作台（仅在无可用记录 / force 时） =====
  if (!appToken) {
    deps.onProgress?.({ step: "app", message: "创建多维表格应用…" });
    const appRes = await client.createBitableApp(deps.appName || "深瞳AI · 三省六部工作台");
    if (!appRes.ok || !appRes.data) {
      return { ok: false, error: appRes.error || "创建多维表格应用失败" };
    }
    appToken = appRes.data.app_token;
    appUrl = appRes.data.url || FeishuClient.bitableUrl(appToken);
  }

  const created: CreatedTable[] = [];
  const failed: Array<{ name: string; error: string }> = [];
  const droppedFields: Array<{ table: string; field: string; error: string }> = [];
  let createdCount = 0;
  let reusedCount = 0;

  // ===== 3) 逐表：已存在则复用，缺哪张建哪张 =====
  for (const tbl of parsed) {
    const envKey = TABLE_ENV_KEY[normalizeTableName(tbl.name)] || "";
    const official = ENV_KEY_OWNER[envKey] || "shared";
    let tableId = existing.get(normalizeTableName(tbl.name)) || "";

    if (tableId) {
      reusedCount++;
      // 复用已有表时补齐规范新增字段（否则规范里加列，老装机永远拿不到这一列）
      const addedFields = await ensureFields(client, appToken, tableId, tbl, droppedFields);
      deps.onProgress?.({ step: "reuse", message: `复用已有表：${tbl.name}${addedFields ? `（补 ${addedFields} 个字段）` : ""}` });
    } else {
      deps.onProgress?.({ step: "table", message: `建表：${tbl.name}` });
      const r = await createTableWithFallback(client, appToken, tbl, droppedFields, deps);
      if (!r.ok || !r.tableId) {
        failed.push({ name: tbl.name, error: r.error || "建表失败" });
        continue;
      }
      tableId = r.tableId;
      createdCount++;
    }

    created.push({
      name: tbl.name,
      envKey,
      official,
      tableId,
      url: `${FeishuClient.bitableUrl(appToken)}?table=${tableId}`,
    });
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
    // 规范里新增、用户配置里还没有的表补进来（否则新增表永远不会回填链接）
    for (const c of list) {
      if (merged.some((e) => e.envKey === c.envKey)) continue;
      merged.push({ envKey: c.envKey, name: c.name, url: c.url, access: defaultTableAccess(official, c.envKey) });
    }
    saveOfficialTables(dataRoot, official, merged);
  }

  writeState(dataRoot, {
    appToken,
    appUrl,
    createdAt: new Date().toISOString(),
    tables: created,
    failed,
    droppedFields,
  });

  const summary =
    `完成：新建 ${createdCount} 张、复用 ${reusedCount} 张` +
    (failed.length ? `、失败 ${failed.length} 张` : "") +
    (droppedFields.length ? `、${droppedFields.length} 个字段被飞书拒绝` : "");
  deps.onProgress?.({ step: "done", message: reusedApp ? `复用已有工作台 · ${summary}` : summary });
  return {
    ok: true,
    appToken,
    appUrl,
    tables: created,
    failed,
    reused: reusedApp,
    createdCount,
    reusedCount,
    droppedFields,
  };
}

/**
 * 复用已有表时补齐规范新增字段：先列出已有字段，缺哪个建哪个。
 * 查不到字段列表时直接跳过（宁可少补，也不冒险重复建列）。
 */
async function ensureFields(
  client: FeishuClient,
  appToken: string,
  tableId: string,
  tbl: ParsedTable,
  droppedFields: Array<{ table: string; field: string; error: string }>,
): Promise<number> {
  const listed = await client.listFields(appToken, tableId);
  if (!listed.ok || !listed.data) return 0;
  const has = new Set(listed.data.map((f) => f.field_name || ""));
  let added = 0;
  for (const f of tbl.fields) {
    if (has.has(f.name)) continue;
    const r = await client.createField(appToken, tableId, { field_name: f.name, type: f.type });
    if (r.ok) added++;
    else droppedFields.push({ table: tbl.name, field: f.name, error: r.error || "字段创建失败" });
  }
  return added;
}

/**
 * 建表（含字段级兜底）：
 * 1) 快路径：一次请求把全部字段带上；
 * 2) 被拒时退化：先只建主字段拿到 table_id，再逐个补字段，
 *    失败只记到 droppedFields，不再让整张表消失。
 */
async function createTableWithFallback(
  client: FeishuClient,
  appToken: string,
  tbl: ParsedTable,
  droppedFields: Array<{ table: string; field: string; error: string }>,
  deps: BitableInitDeps,
): Promise<{ ok: boolean; tableId?: string; error?: string }> {
  const full: FeishuResult<{ table_id: string }> = await client.createTable(
    appToken,
    tbl.name,
    tbl.fields.map((f) => ({ field_name: f.name, type: f.type })),
  );
  if (full.ok && full.data) return { ok: true, tableId: full.data.table_id };

  const firstError = full.error || "建表失败";
  const primary = tbl.fields[0];
  if (!primary) return { ok: false, error: firstError };

  deps.onProgress?.({ step: "table", message: `${tbl.name} 整表创建被拒（${firstError}），改为逐字段补齐…` });

  // 主字段也可能因类型被拒（飞书要求第一个字段必须可作主字段）⇒ 退化为文本再试一次
  let minimal = await client.createTable(appToken, tbl.name, [
    { field_name: primary.name, type: primary.type },
  ]);
  if (!minimal.ok && primary.type !== FEISHU_FIELD_TYPE.TEXT) {
    minimal = await client.createTable(appToken, tbl.name, [
      { field_name: primary.name, type: FEISHU_FIELD_TYPE.TEXT },
    ]);
  }
  if (!minimal.ok || !minimal.data) {
    return { ok: false, error: minimal.error || firstError };
  }

  const tableId = minimal.data.table_id;
  for (const f of tbl.fields.slice(1)) {
    const r = await client.createField(appToken, tableId, { field_name: f.name, type: f.type });
    if (!r.ok) droppedFields.push({ table: tbl.name, field: f.name, error: r.error || "字段创建失败" });
  }
  return { ok: true, tableId };
}

const ALL_OFFICIAL_IDS = [
  "taizi", "zhongshu", "menxia", "shangshu", "libu", "hubu",
  "libu_hr", "bingbu", "xingbu", "gongbu", "zaochao", "qintianjian",
];

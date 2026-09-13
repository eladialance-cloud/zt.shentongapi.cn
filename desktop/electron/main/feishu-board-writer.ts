/**
 * 官署产出落飞书（feishu-board-writer）
 *
 * 对标 RRClaw：官署产出除了落本地看板（tasks_source.json / official_outputs），还要回写飞书多维表格
 * —— 任务记录写「军机处·任务主表（共享）」，产出归档写「归档索引表（共享）」。
 *
 * 设计原则：
 * - best-effort：没建表 / 凭证未配置 / 接口失败都只返回 error，不抛异常、不阻塞编排
 * - 不重复调飞书接口：app_token 与 table_id 直接读「一键建表」落盘的 feishu-bitable.json
 * - 只写文本列：字段结构以《多维表格字段设计规范.md》为单一真源，SELECT/DATE/USER/LINK 等
 *   需要飞书专有结构，硬写字符串会被整条拒绝（RRClaw 就是在这里静默失败的），因此按规范过滤
 *
 * 纯函数 + 依赖注入，便于单测（不 import electron）。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { FeishuClient } from "./feishu-client";
import { normalizeTableName, parseSpecMarkdown, readBitableState, readSpecMarkdown, FEISHU_FIELD_TYPE } from "./feishu-bitable";
import type { EdictTask } from "../shared/edict-types";

/** 产出落飞书的目标表（env 键，与 official-detail 的官署表清单一致） */
export const BOARD_TASK_ENV_KEY = "FEISHU_TASK_MAIN_TABLE";
export const BOARD_ARCHIVE_ENV_KEY = "FEISHU_ARCHIVE_INDEX_TABLE";
export const BOARD_KEYWORD_ENV_KEY = "FEISHU_KEYWORD_TABLE";
export const BOARD_STRATEGY_ENV_KEY = "FEISHU_STRATEGY_TABLE";

/** 种子数据文件（对标 RRClaw「爆款提示词.csv」预填）：关键词起步清单 */
export const SEED_KEYWORDS_FILE = "关键词种子.json";

export interface BoardWriterDeps {
  dataRoot: string;
  /** 规范 md 根：开发 resources/，打包 process.resourcesPath */
  resourcesRoot: string;
  /** 未配置凭证时传 null（调用方会拿到 skipped 结果） */
  client: FeishuClient | null;
}

export interface BoardWriteResult {
  ok: boolean;
  /** true = 条件不满足（未建表/未配凭证/无可写列），属于正常跳过，不是错误 */
  skipped?: boolean;
  error?: string;
}

interface BoardTarget {
  appToken: string;
  tableId: string;
  /** 规范里的章节名（用于反查可写字段） */
  name: string;
}

/** 从「一键建表」状态里解析目标表（未建表 ⇒ null） */
export function resolveBoardTarget(dataRoot: string, envKey: string): BoardTarget | null {
  const state = readBitableState(dataRoot);
  if (!state?.appToken) return null;
  const hit = (state.tables ?? []).find((t) => t.envKey === envKey && t.tableId);
  return hit ? { appToken: state.appToken, tableId: hit.tableId, name: hit.name } : null;
}

/** 规范里该表的文本列（其余类型需要飞书专有结构，不硬写） */
export function textFieldsOf(resourcesRoot: string, tableName: string): Set<string> {
  const parsed = parseSpecMarkdown(readSpecMarkdown(resourcesRoot));
  const hit = parsed.find((t) => normalizeTableName(t.name) === normalizeTableName(tableName));
  return new Set(
    (hit?.fields ?? []).filter((f) => f.type === FEISHU_FIELD_TYPE.TEXT).map((f) => f.name),
  );
}

function pickTextFields(record: Record<string, unknown>, allowed: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!allowed.has(key)) continue;
    const text = typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
    if (text) out[key] = text;
  }
  return out;
}

/** 任务 → 任务主表记录（字段名照规范「军机处 · 任务主表」） */
export function taskRecord(task: EdictTask): Record<string, unknown> {
  const lastFlow = (task.flow_log ?? [])[task.flow_log?.length ? task.flow_log.length - 1 : 0];
  const lastProgress = (task.progress_log ?? [])[task.progress_log?.length ? task.progress_log.length - 1 : 0];
  return {
    id: task.id,
    title: task.title,
    official: task.official || "",
    org: task.org || "",
    state: task.state || "",
    now: lastProgress?.text || "",
    block: task.block || "",
    output: (task.output || "").slice(0, 5000),
    flow_log: lastFlow ? `${lastFlow.from}→${lastFlow.to}：${lastFlow.remark}` : "",
  };
}

export interface ArchiveEntry {
  taskId: string;
  title: string;
  agentLabel: string;
  output: string;
}

/** 产出归档 → 归档索引表记录（字段名照规范「归档索引表」） */
export function archiveRecord(entry: ArchiveEntry): Record<string, unknown> {
  return {
    文档编号: entry.taskId,
    文档标题: `${entry.title}（${entry.agentLabel}产出）`.slice(0, 200),
    摘要: (entry.output || "").slice(0, 5000),
  };
}

async function appendRecord(
  deps: BoardWriterDeps,
  envKey: string,
  record: Record<string, unknown>,
): Promise<BoardWriteResult> {
  const target = resolveBoardTarget(deps.dataRoot, envKey);
  if (!target) return { ok: false, skipped: true, error: "未找到目标表（请先执行一键组队建表）" };
  if (!deps.client) return { ok: false, skipped: true, error: "飞书凭证未配置" };
  const fields = pickTextFields(record, textFieldsOf(deps.resourcesRoot, target.name));
  if (Object.keys(fields).length === 0) {
    return { ok: false, skipped: true, error: `规范未定义可写文本列：${target.name}` };
  }
  const res = await deps.client.batchAddRecords(target.appToken, target.tableId, [fields]);
  if (!res.ok) return { ok: false, error: res.error || "写入飞书失败" };
  return { ok: true };
}

/** 任务记录写「军机处·任务主表（共享）」（best-effort） */
export function appendTaskToBoard(deps: BoardWriterDeps, task: EdictTask): Promise<BoardWriteResult> {
  return appendRecord(deps, BOARD_TASK_ENV_KEY, taskRecord(task));
}

/** 产出归档写「归档索引表（共享）」（best-effort） */
export function appendArchiveToBoard(deps: BoardWriterDeps, entry: ArchiveEntry): Promise<BoardWriteResult> {
  return appendRecord(deps, BOARD_ARCHIVE_ENV_KEY, archiveRecord(entry));
}

export interface StrategyVersionEntry {
  version: string;
  reason: string;
  summary: string;
  kpi?: string;
  execTable?: string;
}

/** 战略版本记录 →「中书省·战略表」（字段名照规范「中书省 · 战略表」） */
export function strategyVersionRecord(entry: StrategyVersionEntry): Record<string, unknown> {
  return {
    版本号: entry.version,
    触发原因: entry.reason,
    变更摘要: entry.summary,
    "KPI 指标": entry.kpi || "",
    落地执行表: entry.execTable || "",
  };
}

/** 战略版本记录写「中书省·战略表」（best-effort；一键组队建档后写 V1.0） */
export function appendStrategyVersionToBoard(
  deps: BoardWriterDeps,
  entry: StrategyVersionEntry,
): Promise<BoardWriteResult> {
  return appendRecord(deps, BOARD_STRATEGY_ENV_KEY, strategyVersionRecord(entry));
}

export interface SeedStarterResult {
  ok: boolean;
  skipped?: boolean;
  added?: number;
  error?: string;
}

/**
 * 预填种子数据：把《关键词种子.json》写进「礼部·关键词表」。
 * 幂等：表里已有记录就跳过，不重复灌数据。
 */
export async function seedStarterData(deps: BoardWriterDeps): Promise<SeedStarterResult> {
  const target = resolveBoardTarget(deps.dataRoot, BOARD_KEYWORD_ENV_KEY);
  if (!target) return { ok: false, skipped: true, error: "未找到「礼部·关键词表」（请先执行一键建表）" };
  if (!deps.client) return { ok: false, skipped: true, error: "飞书凭证未配置" };
  let rows: Array<Record<string, unknown>> = [];
  try {
    const file = path.join(deps.resourcesRoot, "edict", "data", SEED_KEYWORDS_FILE);
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (Array.isArray(parsed)) rows = parsed as Array<Record<string, unknown>>;
  } catch {
    return { ok: false, skipped: true, error: "种子数据文件缺失或损坏" };
  }
  if (!rows.length) return { ok: false, skipped: true, error: "种子数据为空" };

  const existing = await deps.client.listRecords(target.appToken, target.tableId, { pageSize: 1 });
  if (existing.ok && (existing.data?.items?.length ?? 0) > 0) return { ok: true, skipped: true, added: 0 };

  const allowed = textFieldsOf(deps.resourcesRoot, target.name);
  const records = rows.map((r) => pickTextFields(r, allowed)).filter((r) => Object.keys(r).length > 0);
  if (!records.length) return { ok: false, skipped: true, error: `规范未定义可写文本列：${target.name}` };
  const res = await deps.client.batchAddRecords(target.appToken, target.tableId, records);
  if (!res.ok) return { ok: false, error: res.error || "写入种子数据失败" };
  return { ok: true, added: records.length };
}

/**
 * 战略方向文档（strategic-doc）
 *
 * 归属：**中书省**牵头维护（中书省是「方案起草人」，见 resources/edict/profiles/zhongshu.md）。
 * 一键组队流水线第 5 步会创建/复用一份飞书云文档，把链接写进中书省的飞书表清单
 * （envKey = FEISHU_STRATEGY_DOC），SOUL 里用 {{FEISHU_DOC:战略方向文档}} 占位，运行时替换为真实链接。
 *
 * 纯函数 + 依赖注入，便于单测（不 import electron）。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { FeishuClient } from "./feishu-client";
import { getOfficialTables, saveOfficialTables } from "./official-detail";

export const STRATEGIC_DOC_ENV_KEY = "FEISHU_STRATEGY_DOC";
export const STRATEGIC_DOC_NAME = "战略方向文档";
/** 牵头官署：中书省 */
export const STRATEGIC_DOC_OWNER = "zhongshu";

const STATE_FILE = "strategic-doc.json";
const DOC_TITLE = "深瞳AI · 战略方向文档";

/** 文档初始提纲（只写一次，后续由中书省维护） */
export const STRATEGIC_DOC_OUTLINE = [
  "一、战略目标：本年度要达成的 1-3 个可量化结果",
  "二、目标客户：服务谁、不服务谁",
  "三、核心打法：内容 / 获客 / 交付三条主线各自的抓手",
  "四、资源与预算：人力、费用、外部合作",
  "五、度量口径：用什么指标判断成了没成",
  "六、风险与红线：合规、口碑、交付风险",
];

export interface StrategicDocState {
  documentId: string;
  url: string;
  title: string;
  createdAt: string;
}

/** 读取已保存的战略文档状态（无记录 / 损坏 ⇒ null） */
export function readStrategicDocState(dataRoot: string): StrategicDocState | null {
  try {
    const f = path.join(dataRoot, STATE_FILE);
    if (!fs.existsSync(f)) return null;
    const parsed = JSON.parse(fs.readFileSync(f, "utf-8")) as StrategicDocState;
    if (!parsed || typeof parsed.url !== "string" || !parsed.url) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStrategicDocState(dataRoot: string, state: StrategicDocState): void {
  try {
    const f = path.join(dataRoot, STATE_FILE);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // 忽略持久化失败，不影响主流程
  }
}

/** 把战略方向文档链接写进中书省的飞书表清单（幂等：已有则更新链接） */
export function bindStrategicDocToOwner(dataRoot: string, url: string): void {
  const current = getOfficialTables(dataRoot, STRATEGIC_DOC_OWNER);
  const entry = {
    envKey: STRATEGIC_DOC_ENV_KEY,
    name: STRATEGIC_DOC_NAME,
    url,
    access: "rw" as const,
  };
  const exists = current.some((t) => t.envKey === STRATEGIC_DOC_ENV_KEY);
  const merged = exists
    ? current.map((t) => (t.envKey === STRATEGIC_DOC_ENV_KEY ? { ...t, url } : t))
    : [...current, entry];
  saveOfficialTables(dataRoot, STRATEGIC_DOC_OWNER, merged);
}

export interface StrategicDocDeps {
  client: FeishuClient;
  dataRoot: string;
  /** 可选：创建后重写中书省 SOUL，让占位符立刻被替换成真实链接 */
  refreshSoul?: () => void;
  /**
   * 可选：建档后往「中书省·战略表」补一条 V1.0 记录（对标 RRClaw 的战略版本留痕）。
   * best-effort：失败不抛异常、不影响文档本身。
   */
  recordInitialVersion?: (state: StrategicDocState) => Promise<void>;
}

export interface StrategicDocResult {
  ok: boolean;
  url?: string;
  reused?: boolean;
  error?: string;
}

/**
 * 创建或复用战略方向文档。
 * - 已有记录 ⇒ 直接复用（并刷新中书省表清单/SOUL），不重复建文档
 * - 无记录 ⇒ 建 docx + 写初始提纲 ⇒ 落盘 ⇒ 回填中书省
 */
export async function createOrReuseStrategicDoc(deps: StrategicDocDeps): Promise<StrategicDocResult> {
  const prior = readStrategicDocState(deps.dataRoot);
  if (prior) {
    bindStrategicDocToOwner(deps.dataRoot, prior.url);
    deps.refreshSoul?.();
    return { ok: true, url: prior.url, reused: true };
  }

  const rootRes = await deps.client.getRootFolderToken();
  const res = await deps.client.createDocx(DOC_TITLE, rootRes.ok ? rootRes.data : undefined);
  if (!res.ok || !res.data) {
    return { ok: false, error: res.error || "创建战略方向文档失败" };
  }
  const documentId = res.data.document_id;
  const url = res.data.url || `https://feishu.cn/docx/${documentId}`;

  // 写初始提纲（失败不影响文档本身可用）
  for (const line of STRATEGIC_DOC_OUTLINE) {
    const r = await deps.client.appendDocxText(documentId, line);
    if (!r.ok) break;
  }

  const state: StrategicDocState = {
    documentId,
    url,
    title: DOC_TITLE,
    createdAt: new Date().toISOString(),
  };
  writeStrategicDocState(deps.dataRoot, state);
  bindStrategicDocToOwner(deps.dataRoot, url);
  deps.refreshSoul?.();
  // 战略表补 V1.0 记录（best-effort：失败不影响文档本身）
  if (deps.recordInitialVersion) {
    try {
      await deps.recordInitialVersion(state);
    } catch {
      // 忽略：版本留痕失败不阻塞建档
    }
  }
  return { ok: true, url, reused: false };
}

// ===== 运行时读取（编排器注入战略上下文） =====

/** 读取来源：feishu=实时拉取；cache=命中 TTL 缓存；none=尚未创建；error=拉取失败且无缓存 */
export type StrategicDocSource = "feishu" | "cache" | "none" | "error";

export interface StrategicDocReadResult {
  ok: boolean;
  /** 已按 maxChars 截断的正文；不可用时为空串 */
  text: string;
  source: StrategicDocSource;
  error?: string;
  fetchedAt?: string;
}

export interface ReadStrategicDocOptions {
  /** 缓存有效期（毫秒），默认 5 分钟（对标 RRClaw _strategy_cache） */
  ttlMs?: number;
  /** 返回文本上限，默认 4000；全文给中书省、摘要给尚书省由调用方传值 */
  maxChars?: number;
  /** 忽略缓存强制拉取 */
  force?: boolean;
}

const STRATEGY_CACHE_TTL_MS = 5 * 60 * 1000;
const STRATEGY_MAX_CHARS = 4000;

/** documentId → 正文缓存（仅进程内存，不落盘：战略文档含经营信息） */
const strategyCache = new Map<string, { text: string; fetchedAt: string; expiresAt: number }>();

/** 清空战略文档缓存（测试 / 用户手动刷新） */
export function clearStrategyCache(): void {
  strategyCache.clear();
}

/** 老状态文件可能没存 documentId：从链接兜底解析 */
function documentIdFromUrl(url: string): string {
  const m = /\/docx\/([A-Za-z0-9]+)/.exec(url || "");
  return m ? m[1] : "";
}

function clipText(text: string, maxChars: number): string {
  if (maxChars <= 0 || text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n…（战略文档较长，已截断）";
}

/**
 * 读取战略方向文档正文（best-effort，不抛异常）：
 * - 未创建 ⇒ { source: "none" }
 * - TTL 内 ⇒ 直接回缓存，不重复打飞书接口
 * - 拉取失败但有旧缓存 ⇒ 回旧缓存并带 error（上层可据此提示，编排不阻塞）
 */
export async function readStrategicDoc(
  dataRoot: string,
  client: FeishuClient,
  options: ReadStrategicDocOptions = {},
): Promise<StrategicDocReadResult> {
  const ttlMs = options.ttlMs ?? STRATEGY_CACHE_TTL_MS;
  const maxChars = options.maxChars ?? STRATEGY_MAX_CHARS;
  const state = readStrategicDocState(dataRoot);
  if (!state) return { ok: false, text: "", source: "none", error: "尚未创建战略方向文档" };
  const documentId = state.documentId || documentIdFromUrl(state.url);
  if (!documentId) return { ok: false, text: "", source: "error", error: "战略文档状态缺少 documentId" };

  const now = Date.now();
  const cached = strategyCache.get(documentId);
  if (!options.force && cached && cached.expiresAt > now) {
    return { ok: true, text: clipText(cached.text, maxChars), source: "cache", fetchedAt: cached.fetchedAt };
  }

  const res = await client.getDocxRawContent(documentId);
  if (!res.ok || !res.data) {
    if (cached) {
      return { ok: true, text: clipText(cached.text, maxChars), source: "cache", fetchedAt: cached.fetchedAt, error: res.error };
    }
    return { ok: false, text: "", source: "error", error: res.error || "读取战略方向文档失败" };
  }
  const text = (res.data.content || "").trim();
  const fetchedAt = new Date(now).toISOString();
  strategyCache.set(documentId, { text, fetchedAt, expiresAt: now + ttlMs });
  return { ok: true, text: clipText(text, maxChars), source: "feishu", fetchedAt };
}
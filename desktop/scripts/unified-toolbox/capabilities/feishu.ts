/**
 * 飞书能力【真实现】
 *
 * 让 AI 员工（经 Hermes / n8n 工具面）真正读写飞书多维表格。
 * 之前这里是「结构化桩」，只校验参数返回占位；现改为调用飞书开放平台官方 HTTP API。
 *
 * 凭证来源（按优先级）：
 *  1. 环境变量 FEISHU_APP_ID / FEISHU_APP_SECRET（由主进程从 credential-store 解密后注入子进程）
 *  2. 环境变量 ST_FEISHU_CREDENTIALS 指向的 JSON 文件 { "appId": "...", "appSecret": "..." }
 *
 * 支持的动作（对应 registry.yaml 中的 feishu.* 工具）：
 *  - create_table   建数据表（可带字段定义）
 *  - list_tables    列出 app 下的所有数据表
 *  - add_records    批量写入记录
 *  - list_records   读取记录（支持分页）
 */

export type CapabilityResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  code?: number;
};

export interface FeishuConfig {
  appId: string;
  appSecret: string;
}

const DEFAULT_BASE_URL = "https://open.feishu.cn/open-apis";

export function getBaseUrl(): string {
  return process.env.FEISHU_BASE_URL || DEFAULT_BASE_URL;
}

/** 读取飞书凭证：env 直读优先，其次 JSON 文件；缺任一返回 null。 */
export function resolveFeishuConfig(
  env: NodeJS.ProcessEnv = process.env,
  readFile: (p: string) => string = (p) => require("node:fs").readFileSync(p, "utf-8"),
): FeishuConfig | null {
  const id = (env.FEISHU_APP_ID || "").trim();
  const secret = (env.FEISHU_APP_SECRET || "").trim();
  if (id && secret) return { appId: id, appSecret: secret };
  const file = (env.ST_FEISHU_CREDENTIALS || "").trim();
  if (file) {
    try {
      const parsed = JSON.parse(readFile(file)) as { appId?: string; appSecret?: string };
      const fid = (parsed?.appId || "").trim();
      const fsecret = (parsed?.appSecret || "").trim();
      if (fid && fsecret) return { appId: fid, appSecret: fsecret };
    } catch {
      return null;
    }
  }
  return null;
}

/** tenant_access_token 进程内缓存（提前 60s 过期）。 */
let cachedToken: { token: string; expireAt: number } | null = null;
/** 便于测试重置 */
export function resetFeishuTokenCache(): void {
  cachedToken = null;
}

export interface FeishuCallResult {
  ok: boolean;
  data?: any;
  error?: string;
  code?: number;
}

/**
 * 调用飞书 API（自动带 tenant_access_token）。
 * - 99991663/99991661/99991664（token 失效）自动刷新并重试一次
 * - 不抛异常，统一返回 {ok,data?,error?,code?}
 */
export async function feishuApi(
  config: FeishuConfig,
  method: string,
  pathname: string,
  body?: unknown,
  opts: { fetchImpl?: typeof fetch; baseUrl?: string; retried?: boolean } = {},
): Promise<FeishuCallResult> {
  const f = opts.fetchImpl || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : undefined);
  if (!f) return { ok: false, error: "当前运行环境不支持 fetch" };
  const base = opts.baseUrl || getBaseUrl();

  let token: string;
  try {
    token = await getTenantToken(config, f, base);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  let res: Response;
  try {
    res = await f(`${base}${pathname}`, {
      method,
      headers: {
        "content-type": "application/json; charset=utf-8",
        authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, error: `请求飞书失败: ${err instanceof Error ? err.message : String(err)}` };
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `飞书返回非 JSON（HTTP ${res.status}）`, code: res.status };
  }

  const code = typeof json?.code === "number" ? json.code : -1;
  // token 失效：刷新后重试一次
  if (!opts.retried && (code === 99991663 || code === 99991661 || code === 99991664)) {
    cachedToken = null;
    return feishuApi(config, method, pathname, body, { ...opts, retried: true });
  }
  if (code !== 0) {
    return { ok: false, error: json?.msg || `飞书错误码 ${code}`, code };
  }
  return { ok: true, data: json?.data, code: 0 };
}

/** 获取 tenant_access_token（带缓存）。 */
export async function getTenantToken(
  config: FeishuConfig,
  fetchImpl: typeof fetch,
  baseUrl: string = getBaseUrl(),
): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expireAt > now + 60_000) return cachedToken.token;

  const res = await fetchImpl(`${baseUrl}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  const json: any = await res.json();
  if (json?.code !== 0 || !json?.tenant_access_token) {
    throw new Error(json?.msg || `获取 tenant_access_token 失败（code ${json?.code}）`);
  }
  const expire = typeof json.expire === "number" ? json.expire : 7200;
  cachedToken = { token: json.tenant_access_token, expireAt: now + expire * 1000 };
  return cachedToken.token;
}

/** 飞书字段类型映射（规范 13 种 → 飞书 type 编号） */
export const FEISHU_FIELD_TYPE: Record<string, number> = {
  TEXT: 1,
  NUM: 2,
  RATING: 2,
  DATE: 5,
  CHECK: 7,
  USER: 11,
  LINK: 15,
  LOOKUP: 19,
  FORMULA: 20,
  RELATE: 21,
  FILE: 17,
};

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 入参可能是 JSON 字符串（MCP 工具面参数统一为 string）或已解析的数组/对象 */
function asJson<T>(v: unknown, fallback: T): T {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

/**
 * 统一入口：依据 input.action 分派到具体飞书操作。
 * 缺 action 时按历史行为回退 create_table（兼容旧调用）。
 */
export async function executeFeishu(
  input: Record<string, unknown>,
  deps: { fetchImpl?: typeof fetch; env?: NodeJS.ProcessEnv; baseUrl?: string } = {},
): Promise<CapabilityResult> {
  const env = deps.env || process.env;
  const config = resolveFeishuConfig(env);
  if (!config) {
    return { ok: false, error: "飞书凭证未配置（FEISHU_APP_ID / FEISHU_APP_SECRET）" };
  }

  const action = (asString(input?.action) || "create_table").toLowerCase();
  const fetchImpl = deps.fetchImpl;
  const baseUrl = deps.baseUrl;

  switch (action) {
    case "create_table": {
      const appToken = asString(input?.app_token) || asString(input?.bitable_token);
      const tableName = asString(input?.table_name);
      if (!appToken) return { ok: false, error: "缺少必填参数 app_token" };
      if (!tableName) return { ok: false, error: "缺少必填参数 table_name" };
      const body: Record<string, unknown> = { table: { name: tableName } };
      const fields = asJson<any[] | null>(input?.fields, null);
      if (Array.isArray(fields) && fields.length) {
        body.table = {
          name: tableName,
          default_view_name: "表格",
          fields: fields.map((f) => ({
            field_name: asString(f?.name),
            type: FEISHU_FIELD_TYPE[asString(f?.type).toUpperCase()] ?? 1,
          })),
        };
      }
      const r = await feishuApi(config, "POST", `/bitable/v1/apps/${appToken}/tables`, body, { fetchImpl, baseUrl });
      return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
    }

    case "list_tables": {
      const appToken = asString(input?.app_token) || asString(input?.bitable_token);
      if (!appToken) return { ok: false, error: "缺少必填参数 app_token" };
      const r = await feishuApi(config, "GET", `/bitable/v1/apps/${appToken}/tables?page_size=100`, undefined, { fetchImpl, baseUrl });
      return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
    }

    case "add_records": {
      const appToken = asString(input?.app_token) || asString(input?.bitable_token);
      const tableId = asString(input?.table_id);
      const records = asJson<any[] | null>(input?.records, null);
      if (!appToken) return { ok: false, error: "缺少必填参数 app_token" };
      if (!tableId) return { ok: false, error: "缺少必填参数 table_id" };
      if (!records || !records.length) return { ok: false, error: "缺少必填参数 records" };      const r = await feishuApi(
        config,
        "POST",
        `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`,
        { records: records.map((rec) => (rec && rec.fields ? rec : { fields: rec })) },
        { fetchImpl, baseUrl },
      );
      return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
    }

    case "list_records": {
      const appToken = asString(input?.app_token) || asString(input?.bitable_token);
      const tableId = asString(input?.table_id);
      if (!appToken) return { ok: false, error: "缺少必填参数 app_token" };
      if (!tableId) return { ok: false, error: "缺少必填参数 table_id" };
      const pageSize = Number(input?.page_size) || 100;
      const pageToken = asString(input?.page_token);
      const q = new URLSearchParams({ page_size: String(Math.min(500, Math.max(1, pageSize))) });
      if (pageToken) q.set("page_token", pageToken);
      const r = await feishuApi(config, "GET", `/bitable/v1/apps/${appToken}/tables/${tableId}/records?${q.toString()}`, undefined, { fetchImpl, baseUrl });
      return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error, code: r.code };
    }

    default:
      return { ok: false, error: `不支持的动作: ${action}` };
  }
}

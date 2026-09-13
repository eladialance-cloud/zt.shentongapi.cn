/**
 * MySQL 能力【真实现】
 *
 * 之前是「结构化桩」；现改为通过 mysql2 连接执行查询（只允许只读 SELECT/SHOW/DESC/EXPLAIN）。
 * 连接参数来自环境变量：
 *   ST_MYSQL_HOST / ST_MYSQL_PORT / ST_MYSQL_USER / ST_MYSQL_PASSWORD / ST_MYSQL_DATABASE
 *
 * 安全：默认拒绝写操作（INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE 等），除非显式设置
 *   ST_MYSQL_ALLOW_WRITE=1。
 * 依赖 mysql2 为可选依赖：未安装时返回明确错误，不崩溃。
 */

export type CapabilityResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  code?: number;
};

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  allowWrite: boolean;
}

const WRITE_RE = /^\s*(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|rename)\b/i;

export function resolveMysqlConfig(env: NodeJS.ProcessEnv = process.env): MysqlConfig | null {
  const host = (env.ST_MYSQL_HOST || "").trim();
  const user = (env.ST_MYSQL_USER || "").trim();
  const database = (env.ST_MYSQL_DATABASE || env.ST_MYSQL_DB || "").trim();
  if (!host || !user) return null;
  const port = Number(env.ST_MYSQL_PORT) || 3306;
  return {
    host,
    port,
    user,
    password: env.ST_MYSQL_PASSWORD || env.ST_MYSQL_PWD || "",
    database,
    allowWrite: env.ST_MYSQL_ALLOW_WRITE === "1",
  };
}

/** 校验 SQL 安全性；返回 null 表示通过，否则返回错误信息。 */
export function validateSql(sql: string, allowWrite: boolean): string | null {
  const s = (sql || "").trim();
  if (!s) return "缺少必填参数 sql";
  if (!allowWrite && WRITE_RE.test(s)) {
    return "只读模式下不允许写操作（如需开启请设置 ST_MYSQL_ALLOW_WRITE=1）";
  }
  // 禁止多语句（防注入）
  const withoutTrailing = s.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return "不允许多条 SQL 语句";
  }
  return null;
}

interface MysqlPoolLike {
  query(opts: { sql: string; values?: unknown[] }): Promise<[unknown, unknown]>;
  end(): Promise<void>;
}

/** 建立连接（懒加载 mysql2；未安装返回 null 并给出错误） */
export async function createMysqlPool(
  config: MysqlConfig,
  requireFn: (m: string) => unknown = require,
): Promise<{ pool: MysqlPoolLike } | { error: string }> {
  let mysql: any;
  try {
    mysql = requireFn("mysql2/promise");
  } catch {
    return { error: "未安装 mysql2 依赖，无法执行 MySQL 查询（请先安装：npm i mysql2）" };
  }
  try {
    const pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database || undefined,
      waitForConnections: true,
      connectionLimit: 4,
      timezone: "+08:00",
    });
    return { pool };
  } catch (err) {
    return { error: `创建 MySQL 连接池失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** 执行 MySQL 查询（默认只读）。 */
export async function executeMysql(
  input: Record<string, unknown>,
  deps: { env?: NodeJS.ProcessEnv; pool?: MysqlPoolLike; requireFn?: (m: string) => unknown } = {},
): Promise<CapabilityResult> {
  const env = deps.env || process.env;
  const sql = typeof input?.sql === "string" ? input.sql : "";
  const values = Array.isArray(input?.values) ? (input.values as unknown[]) : undefined;

  let allowWrite = false;
  let pool = deps.pool;
  if (!pool) {
    const config = resolveMysqlConfig(env);
    if (!config) return { ok: false, error: "MySQL 未配置（ST_MYSQL_HOST / ST_MYSQL_USER）" };
    allowWrite = config.allowWrite;
    const created = await createMysqlPool(config, deps.requireFn);
    if ("error" in created) return { ok: false, error: created.error };
    pool = created.pool;
  }

  const invalid = validateSql(sql, allowWrite);
  if (invalid) return { ok: false, error: invalid };

  try {
    const [rows] = await pool.query({ sql, values });
    return { ok: true, data: { rows } };
  } catch (err) {
    return { ok: false, error: `MySQL 查询失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

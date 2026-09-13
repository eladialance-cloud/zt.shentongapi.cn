/**
 * flows 业务流引擎 ↔ 飞书多维表格 落点映射
 *
 * 背景：flows 的 FeishuStore 按 **collection**（业务流侧英文 snake_case）查表：
 *   config.storage_feishu = { app_token, tables: { "<collection>": "tblXXXX" } }
 * 而一键组队建的飞书表是按 **envKey** 记录的（feishu-bitable.json 的 tables[].envKey）。
 * 两边命名不同，必须显式映射，否则 storage_backend=feishu 时引擎找不到表。
 *
 * 映射口径见 resources/edict/data/飞书占位符映射表.md 第四节（多对一：多个 collection 可落同一张表）。
 */

/** flows collection → 飞书表 envKey（唯一真源） */
export const FLOWS_COLLECTION_ENV_KEY: Record<string, string> = {
  // 工部 · 内容生产表 / 文案库
  content_assets: "FEISHU_CONTENT_TABLE",
  traffic_copy_records: "FEISHU_COPYWRITING_TABLE",
  new_media_articles: "FEISHU_CONTENT_TABLE",
  // 工部 · 每日海报表
  daily_poster_records: "FEISHU_DAILY_POSTER_TABLE",
  // 尚书省 · 派发执行汇总表
  daily_summary_records: "FEISHU_DISPATCH_TABLE",
  // 中书省 · 战略表（战略草案归档与版本留痕）
  ceo_strategy_docs: "FEISHU_STRATEGY_TABLE",
  // 礼部 · 关键词表 / 爆款采集表
  ceo_keyword_plans: "FEISHU_KEYWORD_TABLE",
  traffic_hot_videos: "FEISHU_HOT_CONTENT_TABLE",
  // 兵部 · 客户档案表 / 客户跟进表
  customer_records: "FEISHU_CUSTOMER_TABLE",
  sales_followup_records: "FEISHU_FOLLOWUP_TABLE",
  // 兵部 · 渠道触达表（加好友 / 内容推送 / 渠道私信）
  sales_friend_records: "FEISHU_CHANNEL_TABLE",
  sales_push_records: "FEISHU_CHANNEL_TABLE",
  channel_dm_records: "FEISHU_CHANNEL_TABLE",
  // 兵部 · 社群运营表（私域群发）
  private_domain_push_records: "FEISHU_COMMUNITY_TABLE",
};

export interface BitableStateLike {
  appToken?: string;
  tables?: Array<{ envKey?: string; tableId?: string }>;
}

/** 飞书建表状态 → flows 侧 `tables`（collection → table_id）；未建的 collection 直接跳过 */
export function buildFlowsFeishuTables(
  state: BitableStateLike | null | undefined,
): Record<string, string> {
  const byEnvKey = new Map<string, string>();
  for (const t of state?.tables ?? []) {
    if (t?.envKey && t?.tableId) byEnvKey.set(t.envKey, t.tableId);
  }
  const out: Record<string, string> = {};
  for (const [collection, envKey] of Object.entries(FLOWS_COLLECTION_ENV_KEY)) {
    const tableId = byEnvKey.get(envKey);
    if (tableId) out[collection] = tableId;
  }
  return out;
}

/**
 * 构建注入 flows 的飞书落表环境变量。
 * 无 appToken 或没有任何已建表时返回空对象（不写入、不覆盖既有配置）。
 */
export function buildFlowsFeishuEnv(
  state: BitableStateLike | null | undefined,
): Record<string, string> {
  const appToken = state?.appToken?.trim();
  const tables = buildFlowsFeishuTables(state);
  if (!appToken || Object.keys(tables).length === 0) return {};
  return {
    FLOWS_FEISHU_APP_TOKEN: appToken,
    FLOWS_FEISHU_TABLES: JSON.stringify(tables),
  };
}
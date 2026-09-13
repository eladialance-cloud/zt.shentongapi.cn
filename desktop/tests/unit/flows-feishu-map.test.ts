import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FLOWS_COLLECTION_ENV_KEY,
  buildFlowsFeishuEnv,
  buildFlowsFeishuTables,
} from "../../electron/main/flows-feishu-map";
import { DEFAULT_OFFICIAL_TABLES, SHARED_OFFICIAL_TABLES } from "../../electron/main/official-detail";

const CAPS_DIR = join(__dirname, "../../resources/service-registry/modules/flows/capabilities");

/** flows 代码里声明的全部 collection（唯一真源：capabilities/*.py 的 *_COLLECTION 常量） */
function declaredCollections(): Set<string> {
  const out = new Set<string>();
  for (const file of readdirSync(CAPS_DIR)) {
    if (!file.endsWith(".py")) continue;
    const text = readFileSync(join(CAPS_DIR, file), "utf8");
    for (const m of text.matchAll(/^\w*_COLLECTION\s*=\s*"([^"]+)"/gm)) out.add(m[1]);
  }
  return out;
}

function knownEnvKeys(): Set<string> {
  const keys = new Set<string>();
  for (const list of Object.values(DEFAULT_OFFICIAL_TABLES)) for (const t of list) keys.add(t.envKey);
  for (const t of SHARED_OFFICIAL_TABLES) keys.add(t.envKey);
  return keys;
}

describe("flows-feishu-map（flows collection → 飞书表 落点映射）", () => {
  it("覆盖 flows 代码声明的全部 collection，且没有多余键", () => {
    const declared = declaredCollections();
    expect(declared.size).toBeGreaterThanOrEqual(14);
    for (const c of declared) expect(Object.keys(FLOWS_COLLECTION_ENV_KEY)).toContain(c);
    for (const c of Object.keys(FLOWS_COLLECTION_ENV_KEY)) expect(declared.has(c)).toBe(true);
  });

  it("每个落点 envKey 都是官署表清单里真实存在的键", () => {
    const known = knownEnvKeys();
    for (const envKey of Object.values(FLOWS_COLLECTION_ENV_KEY)) {
      expect(known.has(envKey)).toBe(true);
    }
  });

  it("建表状态 → collection 键的 tables（多对一：三个触达类共用渠道触达表）", () => {
    const tables = buildFlowsFeishuTables({
      appToken: "bascnTEST",
      tables: [
        { envKey: "FEISHU_CONTENT_TABLE", tableId: "tblContent" },
        { envKey: "FEISHU_CHANNEL_TABLE", tableId: "tblChannel" },
        { envKey: "FEISHU_STRATEGY_DOC", tableId: "doxcnNotBitable" },
      ],
    });
    expect(tables.content_assets).toBe("tblContent");
    expect(tables.new_media_articles).toBe("tblContent");
    expect(tables.sales_friend_records).toBe("tblChannel");
    expect(tables.sales_push_records).toBe("tblChannel");
    expect(tables.channel_dm_records).toBe("tblChannel");
    // 未建的表不出现（引擎侧会明确报不可用，而不是静默丢数据）
    expect(tables.ceo_keyword_plans).toBeUndefined();
    // 云文档不是多维表格，不能被当表映射
    expect(Object.values(tables)).not.toContain("doxcnNotBitable");
  });

  it("env 注入：无 appToken 或无已建表时返回空对象（不覆盖既有配置）", () => {
    expect(buildFlowsFeishuEnv(null)).toEqual({});
    expect(buildFlowsFeishuEnv({ appToken: "bascnTEST", tables: [] })).toEqual({});
    expect(buildFlowsFeishuEnv({ appToken: "", tables: [{ envKey: "FEISHU_CONTENT_TABLE", tableId: "t1" }] })).toEqual({});
  });

  it("env 注入：有 appToken 且至少建出一张表时，注入 app token 与 JSON 化的 tables", () => {
    const env = buildFlowsFeishuEnv({
      appToken: "bascnTEST",
      tables: [{ envKey: "FEISHU_CONTENT_TABLE", tableId: "tblContent" }],
    });
    expect(env.FLOWS_FEISHU_APP_TOKEN).toBe("bascnTEST");
    expect(JSON.parse(env.FLOWS_FEISHU_TABLES)).toEqual({ content_assets: "tblContent", new_media_articles: "tblContent" });
  });
});
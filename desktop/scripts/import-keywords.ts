/**
 * M8 素材种子：爆款提示词 CSV 清洗 + 入库脚本。
 *
 * 用途:
 *   从 RRClaw 源 CSV 中抽取 `prompt` 列，去重（保序）、剔除含禁用品牌
 *   token 的行、剔除空行并 trim，输出 UTF-8 的 `resources/sow/爆款提示词.clean.csv`。
 *
 * 运行方式:
 *   node -r tsx scripts/import-keywords.ts
 *   或  npx tsx scripts/import-keywords.ts
 *
 * 合规:
 *   复用 scripts/content-license 的 BANNED_TOKENS 作为去品牌防线。
 *   入库幂等结构见 importToKnowledgeBase（当前离线，不发起网络请求）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BANNED_TOKENS } from "./content-license";

/** 源 CSV（RRClaw 闭源素材，仅本机存在）。 */
const SOURCE_CSV = "E:\\开界\\RRClaw\\resources\\resources\\feishu\\创建多维表格\\爆款提示词.csv";

/** 洁净 CSV 输出路径（相对仓库根）。 */
const OUTPUT_CSV = ["resources", "sow", "爆款提示词.clean.csv"];

/** 输出 CSV 的表头。 */
const OUTPUT_HEADER = "prompt";

/**
 * 解析单行 CSV 字段（支持双引号包裹与 "" 转义），用于 cleanCsvRows。
 * 注意：输入必须是单行记录（换行已被 parseCsvText 归一化）。
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/**
 * 解析整段 CSV 文本为记录数组（string[][]）。
 * 正确处理引号内逗号、引号内换行（多行字段）、"" 转义与 CRLF。
 */
export function parseCsvText(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const normalized = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records: string[][] = [];
  let fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field);
      field = "";
    } else if (ch === "\n") {
      fields.push(field);
      records.push(fields);
      fields = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field !== "" || fields.length > 0) {
    fields.push(field);
    records.push(fields);
  }
  return records;
}

/** 单字段 CSV 转义。 */
export function encodeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 单记录 CSV 转义（拼接回单行）。 */
export function encodeCsvRow(fields: string[]): string {
  return fields.map(encodeCsvField).join(",");
}

/**
 * 清洗 CSV 行数组，抽取出 prompt 列。
 *
 * 规则（保序、去重）：
 *   1. 若首行为表头且含 `prompt` 列，则用该列定位 prompt；否则默认取最后一列。
 *   2. 剔除空行与全空白行。
 *   3. 剔除 prompt 中含 BANNED_TOKENS（品牌 token）的行。
 *   4. 对 prompt 做首尾 trim，去重后保持首次出现顺序。
 */
export function cleanCsvRows(rows: string[]): Array<{ prompt: string }> {
  const firstFields = splitCsvLine(rows[0] ?? "");
  const headerPromptIndex = firstFields.findIndex((f) => f.trim() === "prompt");
  const hasHeader = headerPromptIndex >= 0;
  const promptIndex = hasHeader ? headerPromptIndex : -1;
  const start = hasHeader ? 1 : 0;

  const result: Array<{ prompt: string }> = [];
  const seen = new Set<string>();

  for (let i = start; i < rows.length; i++) {
    const line = (rows[i] ?? "").trim();
    if (!line) continue;

    const fields = splitCsvLine(line);
    const prompt = ((promptIndex >= 0 ? fields[promptIndex] : fields[fields.length - 1]) ?? "").trim();
    if (!prompt) continue;
    if (BANNED_TOKENS.some((token) => prompt.includes(token))) continue;
    if (seen.has(prompt)) continue;

    seen.add(prompt);
    result.push({ prompt });
  }

  return result;
}

/**
 * 入库幂等结构（当前为离线实现，不真正联网调用）。
 *
 * 后续接入 src/api/knowledge-api.ts 的时序（先按知识库名查再上传）：
 *   1. listKnowledgeBases() 按 name 匹配同名知识库；
 *   2. 不存在则 createKnowledgeBase({ name, ... })；
 *   3. uploadDocument(kbId, file) 上传本文件（爆款提示词.clean.csv）；
 *   4. 已存在则跳过创建，直接走上传（或按需更新）。
 *
 * 离线实现：不发起任何网络请求，仅暴露符合上述时序的入参结构。
 */
export function importToKnowledgeBase(
  _rows: Array<{ prompt: string }>,
  _kbName = "爆款提示词素材",
): { ok: true; offline: true } {
  return { ok: true, offline: true };
}

/** 源 CSV 不可读/缺失时的去品牌样例（至少 20 行）。 */
const FALLBACK_THEMES = [
  "顶流借势",
  "达人种草",
  "国货之光",
  "冷知识科普",
  "反差人设",
  "稀缺首发",
  "名人反差",
  "天价探秘",
  "素人逆袭",
  "行业黑幕",
  "极致体验",
  "爆款剪辑",
  "情感共鸣",
  "知识付费",
  "测评种草",
  "场景种草",
  "悬念开场",
  "真实记录",
  "数据说话",
  "趋势解读",
  "人群洞察",
  "品牌故事",
];

/** 生成去品牌样例 prompt（仅当源 CSV 不可用时兜底）。 */
function fallbackRows(): Array<{ prompt: string }> {
  return FALLBACK_THEMES.map((theme) => ({
    prompt: `你是一位爆款内容策划师。请围绕「${theme}」产出一套可直接落地的选题、脚本结构与文案金句，输出结构清晰的执行清单。`,
  }));
}

/** CLI 入口：读源 CSV → cleanCsvRows 清洗 → 写出 UTF-8 CSV。 */
function main(): void {
  const projectRoot = path.resolve(__dirname, "..");
  const outputPath = path.join(projectRoot, ...OUTPUT_CSV);

  let cleaned: Array<{ prompt: string }>;
  let note = "";

  if (existsSync(SOURCE_CSV)) {
    try {
      const records = parseCsvText(readFileSync(SOURCE_CSV, "utf8"));
      const header = records[0] ?? [];
      const promptIndex = header.indexOf("prompt");
      if (promptIndex < 0) {
        cleaned = [];
        note = `源 CSV 表头缺失 prompt 列（实际列：${header.join(",") || "(空)"}），改用去品牌样例生成。`;
      } else {
        const rows = records.map((record) => encodeCsvRow(record));
        cleaned = cleanCsvRows(rows);
        if (cleaned.length === 0) {
          note = "源 CSV 清洗后为空，改用去品牌样例生成。";
        } else {
          console.log(`已读取源 CSV：${SOURCE_CSV}（${records.length} 条记录，prompt 列序号 ${promptIndex}）`);
        }
      }
    } catch (err) {
      cleaned = [];
      note = `源 CSV 读取/解析失败（${err instanceof Error ? err.message : String(err)}），改用去品牌样例生成。`;
    }
  } else {
    cleaned = [];
    note = `源 CSV 不可读（${SOURCE_CSV}），改用去品牌样例生成。`;
  }

  if (cleaned.length === 0) {
    cleaned = fallbackRows();
  }

  mkdirSync(path.dirname(outputPath), { recursive: true });
  const lines = [OUTPUT_HEADER, ...cleaned.map((row) => encodeCsvField(row.prompt))];
  writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf8");

  console.log(`清洗后 prompt 行数：${cleaned.length}`);
  console.log(`已写出：${outputPath}`);
  if (note) console.log(`说明：${note}`);
  console.log("入库：离线阶段已跳过（幂等结构见 importToKnowledgeBase 注释）。");
}

if (require.main === module) {
  main();
}

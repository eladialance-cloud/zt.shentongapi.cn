// 知识库 6 分类纯函数
// 输入：KnowledgeBase 的 name/description/documentCount（类型无 tags 字段，采用名称+描述关键词匹配）
// 输出：品牌规则 / 爆款案例库 / 选题库 / 流程SOP / 客户资料 / 平台规则 / uncategorized

/** 知识库分类 */
export type KnowledgeCategory =
  | "brand-rule"
  | "hit-case"
  | "topic-idea"
  | "process-sop"
  | "customer-profile"
  | "platform-rule"
  | "uncategorized";

/** 6 个业务分类（uncategorized 不单独成卡，并入「全部」） */
export type BusinessKnowledgeCategory = Exclude<KnowledgeCategory, "uncategorized">;

export const KNOWLEDGE_CATEGORIES: readonly BusinessKnowledgeCategory[] = [
  "brand-rule",
  "hit-case",
  "topic-idea",
  "process-sop",
  "customer-profile",
  "platform-rule",
];

/** 分类中文名 */
export const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  "brand-rule": "品牌规则",
  "hit-case": "爆款案例库",
  "topic-idea": "选题库",
  "process-sop": "流程SOP",
  "customer-profile": "客户资料",
  "platform-rule": "平台规则",
  "uncategorized": "未分类",
};

/** 分类关键词（可读常量，匹配时大小写不敏感） */
export const CATEGORY_KEYWORDS: Record<BusinessKnowledgeCategory, string[]> = {
  "brand-rule": ["品牌", "规则", "VI", "视觉", "规范", "logo"],
  "hit-case": ["爆款", "案例", "拆解", "竞品", "对标"],
  "topic-idea": ["选题", "话题", "灵感"],
  "process-sop": ["流程", "SOP", "标准", "手册", "操作指南"],
  "customer-profile": ["客户", "线索", "画像", "人设"],
  "platform-rule": ["平台", "抖音", "小红书", "公众号", "B站", "知乎", "算法", "流量"],
};

/** 品牌规则通用词（规则/规范）：仅作无其他分类命中时的兜底，不参与平局 */
export const BRAND_RULE_GENERIC_KEYWORDS: string[] = ["规则", "规范"];

/** 品牌规则专属关键词（由 CATEGORY_KEYWORDS 剔除通用词得到） */
export const BRAND_RULE_SPECIFIC_KEYWORDS: readonly string[] = CATEGORY_KEYWORDS["brand-rule"].filter(
  (kw) => !BRAND_RULE_GENERIC_KEYWORDS.includes(kw),
);

/**
 * 关键词匹配（text 已小写）：
 * - 拉丁字母关键词（VI/SOP/logo 等）按词边界匹配，避免「VIP」「video」等子串误报
 * - 中文关键词保持子串匹配
 */
function matchesKeyword(text: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (/^[a-z]+$/.test(kw)) {
    return new RegExp(`(^|[^a-z])${kw}([^a-z]|$)`).test(text);
  }
  return text.includes(kw);
}

/** 分类判断所需的最小字段（兼容 KnowledgeBase） */
export interface KnowledgeCategoryInput {
  name: string;
  description?: string | null;
  documentCount?: number;
}

/**
 * 判断知识库所属分类（名称 + 描述，大小写不敏感）
 * 优先级：分类名整体命中 > 专属关键词命中数（同分按 KNOWLEDGE_CATEGORIES 顺序）
 *         > 通用词兜底（品牌规则的「规则/规范」仅在其他分类无命中时生效）
 * 这样「抖音规则」「平台运营规则」等平台类+通用词场景归平台规则，而非品牌规则；
 * 不命中返回 "uncategorized"
 */
export function categorizeKnowledgeBase(kb: KnowledgeCategoryInput): KnowledgeCategory {
  const text = `${kb.name ?? ""} ${kb.description ?? ""}`.toLowerCase();
  // 1) 分类名整体命中（如「平台规则」优先于「规则」关键词，避免误入品牌规则）
  for (const category of KNOWLEDGE_CATEGORIES) {
    if (text.includes(CATEGORY_LABELS[category].toLowerCase())) {
      return category;
    }
  }
  // 2) 专属关键词命中数最多者胜出（品牌规则的「规则/规范」为通用词，不计入此轮）
  let best: KnowledgeCategory = "uncategorized";
  let bestHits = 0;
  for (const category of KNOWLEDGE_CATEGORIES) {
    const keywords =
      category === "brand-rule"
        ? BRAND_RULE_SPECIFIC_KEYWORDS
        : CATEGORY_KEYWORDS[category];
    const hits = keywords.filter((kw) =>
      matchesKeyword(text, kw),
    ).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = category;
    }
  }
  // 3) 通用词兜底：无任何专属关键词命中时，「规则/规范」归入品牌规则
  if (best === "uncategorized") {
    const genericHits = BRAND_RULE_GENERIC_KEYWORDS.filter((kw) =>
      matchesKeyword(text, kw),
    ).length;
    if (genericHits > 0) {
      return "brand-rule";
    }
  }
  return best;
}

/** 分类汇总（分类卡数据源） */
export interface CategorySummary {
  category: BusinessKnowledgeCategory;
  label: string;
  /** 该分类下知识库数量 */
  kbCount: number;
  /** 该分类下 documentCount 之和 */
  documentCount: number;
}

/** 按分类过滤知识库列表 */
export function filterBasesByCategory<T extends KnowledgeCategoryInput>(
  bases: T[],
  category: KnowledgeCategory,
): T[] {
  return bases.filter((kb) => categorizeKnowledgeBase(kb) === category);
}

/** 汇总 6 个分类（未分类不计入任一分类卡，由「全部」承接） */
export function summarizeByCategory(bases: KnowledgeCategoryInput[]): CategorySummary[] {
  return KNOWLEDGE_CATEGORIES.map((category) => {
    const matched = bases.filter((kb) => categorizeKnowledgeBase(kb) === category);
    return {
      category,
      label: CATEGORY_LABELS[category],
      kbCount: matched.length,
      documentCount: matched.reduce((sum, kb) => sum + (kb.documentCount ?? 0), 0),
    };
  });
}

/** 全部文档数（含未分类，用于「全部」卡） */
export function totalDocumentCount(bases: KnowledgeCategoryInput[]): number {
  return bases.reduce((sum, kb) => sum + (kb.documentCount ?? 0), 0);
}

/** 未分类知识库数 */
export function uncategorizedCount(bases: KnowledgeCategoryInput[]): number {
  return bases.filter((kb) => categorizeKnowledgeBase(kb) === "uncategorized").length;
}

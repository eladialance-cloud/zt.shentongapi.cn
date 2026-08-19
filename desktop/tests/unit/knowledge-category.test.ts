// 知识库 6 分类纯函数单测
// 覆盖：6 分类关键词命中（每类至少 1 例）、大小写不敏感、描述匹配、无命中 → uncategorized、documentCount 聚合
import {
  CATEGORY_KEYWORDS,
  CATEGORY_LABELS,
  KNOWLEDGE_CATEGORIES,
  categorizeKnowledgeBase,
  filterBasesByCategory,
  summarizeByCategory,
  totalDocumentCount,
  uncategorizedCount,
} from "@/pages/Knowledge/category";
import type { KnowledgeBase } from "@/types/knowledge";

function kb(overrides: Partial<KnowledgeBase> = {}): KnowledgeBase {
  return {
    id: 1,
    name: "知识库",
    description: "",
    documentCount: 0,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("常量定义", () => {
  it("6 个业务分类，关键词列表可读且非空", () => {
    expect(KNOWLEDGE_CATEGORIES).toHaveLength(6);
    expect(KNOWLEDGE_CATEGORIES).not.toContain("uncategorized");
    for (const c of KNOWLEDGE_CATEGORIES) {
      expect(CATEGORY_KEYWORDS[c].length).toBeGreaterThan(0);
      expect(CATEGORY_LABELS[c].length).toBeGreaterThan(0);
    }
  });
});

describe("categorizeKnowledgeBase 6 分类关键词命中", () => {
  it("品牌规则：品牌/规则/VI/视觉/规范/logo 关键词", () => {
    expect(categorizeKnowledgeBase(kb({ name: "品牌视觉规范" }))).toBe("brand-rule");
    expect(categorizeKnowledgeBase(kb({ name: "VI 手册" }))).toBe("brand-rule");
    expect(categorizeKnowledgeBase(kb({ name: "LOGO 使用规范" }))).toBe("brand-rule");
    expect(categorizeKnowledgeBase(kb({ name: "品牌规则" }))).toBe("brand-rule");
  });

  it("爆款案例库：爆款/案例/拆解/竞品/对标 关键词", () => {
    expect(categorizeKnowledgeBase(kb({ name: "爆款案例拆解" }))).toBe("hit-case");
    expect(categorizeKnowledgeBase(kb({ name: "竞品对标分析" }))).toBe("hit-case");
  });

  it("选题库：选题/话题/灵感 关键词", () => {
    expect(categorizeKnowledgeBase(kb({ name: "本月选题库" }))).toBe("topic-idea");
    expect(categorizeKnowledgeBase(kb({ name: "内容灵感记录" }))).toBe("topic-idea");
  });

  it("流程SOP：流程/SOP/标准/手册/操作指南 关键词", () => {
    expect(categorizeKnowledgeBase(kb({ name: "内容生产 SOP" }))).toBe("process-sop");
    expect(categorizeKnowledgeBase(kb({ name: "运营操作指南" }))).toBe("process-sop");
    expect(categorizeKnowledgeBase(kb({ name: "拍摄标准流程" }))).toBe("process-sop");
  });

  it("客户资料：客户/线索/画像/人设 关键词", () => {
    expect(categorizeKnowledgeBase(kb({ name: "客户画像资料" }))).toBe("customer-profile");
    expect(categorizeKnowledgeBase(kb({ name: "销售线索池" }))).toBe("customer-profile");
    expect(categorizeKnowledgeBase(kb({ name: "账号人设设定" }))).toBe("customer-profile");
  });

  it("平台规则：平台/抖音/小红书/公众号/B站/知乎/算法/流量 关键词", () => {
    expect(categorizeKnowledgeBase(kb({ name: "平台规则" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "小红书运营笔记" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "抖音算法与流量" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "公众号运营" }))).toBe("platform-rule");
  });
});

describe("categorizeKnowledgeBase 边界", () => {
  it("大小写不敏感：LOGO/SOP/B站/VI", () => {
    expect(categorizeKnowledgeBase(kb({ name: "品牌 LOGO 规范" }))).toBe("brand-rule");
    expect(categorizeKnowledgeBase(kb({ name: "sop 手册" }))).toBe("process-sop");
    expect(categorizeKnowledgeBase(kb({ name: "B站运营笔记" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "品牌 vi 规范" }))).toBe("brand-rule");
  });

  it("关键词仅在描述中也能命中", () => {
    expect(
      categorizeKnowledgeBase(kb({ name: "品牌资产库", description: "沉淀品牌视觉与 VI 规范" })),
    ).toBe("brand-rule");
    expect(
      categorizeKnowledgeBase(kb({ name: "运营资料", description: "整理抖音流量与算法规则" })),
    ).toBe("platform-rule");
  });

  it("分类名整体命中优先：平台规则不误入品牌规则", () => {
    expect(categorizeKnowledgeBase(kb({ name: "平台规则" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "品牌规则" }))).toBe("brand-rule");
  });

  it("无命中返回 uncategorized", () => {
    expect(categorizeKnowledgeBase(kb({ name: "随手记" }))).toBe("uncategorized");
    expect(categorizeKnowledgeBase(kb({ name: "参考资料" }))).toBe("uncategorized");
    expect(categorizeKnowledgeBase(kb({ name: "素材" }))).toBe("uncategorized");
    expect(categorizeKnowledgeBase(kb({ name: "", description: "" }))).toBe("uncategorized");
  });
});

describe("平台类关键词优先于通用「规则/规范」（规格审查修复）", () => {
  it("平台关键词 + 通用规则/规范 → 平台规则", () => {
    expect(categorizeKnowledgeBase(kb({ name: "抖音规则" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "平台运营规则" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "小红书运营规则" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "平台发布规范" }))).toBe("platform-rule");
    expect(categorizeKnowledgeBase(kb({ name: "抖音发布规范" }))).toBe("platform-rule");
  });

  it("专属关键词胜出通用词：竞品规则归爆款案例库而非品牌规则", () => {
    expect(categorizeKnowledgeBase(kb({ name: "竞品规则" }))).toBe("hit-case");
    expect(categorizeKnowledgeBase(kb({ name: "客户规则" }))).toBe("customer-profile");
  });

  it("仅含通用规则/规范且无其他分类命中时兜底品牌规则", () => {
    expect(categorizeKnowledgeBase(kb({ name: "规则" }))).toBe("brand-rule");
    expect(categorizeKnowledgeBase(kb({ name: "发文规范" }))).toBe("brand-rule");
  });
});

describe("拉丁关键词词边界与边界场景（代码质量审查修复）", () => {
  it("短拉丁关键词按词边界匹配：VIP客户管理/video 不误入品牌规则", () => {
    expect(categorizeKnowledgeBase(kb({ name: "VIP客户管理" }))).toBe("customer-profile");
    expect(categorizeKnowledgeBase(kb({ name: "video 素材" }))).toBe("uncategorized");
  });

  it("SOP/VI/LOGO 独立出现仍正确命中对应分类", () => {
    expect(categorizeKnowledgeBase(kb({ name: "SOP" }))).toBe("process-sop");
    expect(categorizeKnowledgeBase(kb({ name: "vi" }))).toBe("brand-rule");
    expect(categorizeKnowledgeBase(kb({ name: "LOGO" }))).toBe("brand-rule");
    expect(categorizeKnowledgeBase(kb({ name: "内容生产 SOP" }))).toBe("process-sop");
  });

  it("同分按声明顺序裁决：品牌 视觉 客户 画像 → 品牌规则", () => {
    expect(categorizeKnowledgeBase(kb({ name: "品牌 视觉 客户 画像" }))).toBe("brand-rule");
  });

  it("空输入不崩溃：空名称/空描述/空数组", () => {
    expect(categorizeKnowledgeBase({ name: "", description: "" })).toBe("uncategorized");
    expect(categorizeKnowledgeBase({ name: "", description: null })).toBe("uncategorized");
    expect(categorizeKnowledgeBase({ name: "  " })).toBe("uncategorized");
    const empty = summarizeByCategory([]);
    expect(empty).toHaveLength(6);
    expect(empty.every((s) => s.kbCount === 0 && s.documentCount === 0)).toBe(true);
    expect(totalDocumentCount([])).toBe(0);
    expect(uncategorizedCount([])).toBe(0);
  });
});

describe("summarizeByCategory documentCount 聚合", () => {
  it("documentCount 按分类求和，kbCount 计数，共 6 张分类卡", () => {
    const bases = [
      kb({ id: 1, name: "品牌视觉规范", documentCount: 5 }),
      kb({ id: 2, name: "品牌 VI 手册", documentCount: 3 }),
      kb({ id: 3, name: "爆款案例拆解", documentCount: 8 }),
      kb({ id: 4, name: "抖音算法笔记", documentCount: 2 }),
      kb({ id: 5, name: "随手记", documentCount: 7 }),
    ];
    const summaries = summarizeByCategory(bases);
    expect(summaries).toHaveLength(6);
    const byLabel = Object.fromEntries(summaries.map((s) => [s.label, s]));
    expect(byLabel["品牌规则"].kbCount).toBe(2);
    expect(byLabel["品牌规则"].documentCount).toBe(8);
    expect(byLabel["爆款案例库"].kbCount).toBe(1);
    expect(byLabel["爆款案例库"].documentCount).toBe(8);
    expect(byLabel["平台规则"].kbCount).toBe(1);
    expect(byLabel["平台规则"].documentCount).toBe(2);
    expect(byLabel["选题库"].kbCount).toBe(0);
    expect(byLabel["选题库"].documentCount).toBe(0);
  });

  it("documentCount 缺失时按 0 计入", () => {
    const summaries = summarizeByCategory([{ name: "品牌规则" }]);
    expect(summaries.find((s) => s.label === "品牌规则")?.documentCount).toBe(0);
    expect(summaries.find((s) => s.label === "品牌规则")?.kbCount).toBe(1);
  });

  it("totalDocumentCount 含未分类；uncategorizedCount 统计未分类库数", () => {
    const bases = [
      kb({ id: 1, name: "品牌规则", documentCount: 4 }),
      kb({ id: 2, name: "杂项", documentCount: 6 }),
      kb({ id: 3, name: "素材", documentCount: 10 }),
    ];
    expect(totalDocumentCount(bases)).toBe(20);
    expect(uncategorizedCount(bases)).toBe(2);
  });

  it("filterBasesByCategory 返回该分类列表（含 uncategorized）", () => {
    const bases = [
      kb({ id: 1, name: "品牌视觉规范" }),
      kb({ id: 2, name: "爆款案例" }),
      kb({ id: 3, name: "客户画像" }),
      kb({ id: 4, name: "随手记" }),
    ];
    expect(filterBasesByCategory(bases, "brand-rule").map((b) => b.id)).toEqual([1]);
    expect(filterBasesByCategory(bases, "hit-case").map((b) => b.id)).toEqual([2]);
    expect(filterBasesByCategory(bases, "customer-profile").map((b) => b.id)).toEqual([3]);
    expect(filterBasesByCategory(bases, "uncategorized").map((b) => b.id)).toEqual([4]);
  });
});

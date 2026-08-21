import {
  splitMemory,
  normalizeEntry,
  applyAddEntry,
  applyRemoveEntry,
  applyReplaceEntry,
  memoryFileName,
  memoryCharLimit,
  MEMORY_FILE,
  USER_FILE,
  MEMORY_CHAR_LIMIT,
  USER_CHAR_LIMIT,
} from "../../electron/main/hermes-memory";

describe("splitMemory / normalizeEntry", () => {
  it("按 § 分隔并过滤空块", () => {
    expect(splitMemory("卡片一 § 卡片二 §  § 卡片三")).toEqual(["卡片一", "卡片二", "卡片三"]);
  });
  it("空内容 → 空数组", () => {
    expect(splitMemory("")).toEqual([]);
    expect(splitMemory("   §  §  ")).toEqual([]);
  });
  it("normalizeEntry 去 § 与首尾空白", () => {
    expect(normalizeEntry("  a§b  ")).toBe("a b");
  });
});

describe("memoryFileName / memoryCharLimit", () => {
  it("target 映射到文件与上限", () => {
    expect(memoryFileName("memory")).toBe(MEMORY_FILE);
    expect(memoryFileName("profile")).toBe(USER_FILE);
    expect(memoryCharLimit("memory")).toBe(MEMORY_CHAR_LIMIT);
    expect(memoryCharLimit("profile")).toBe(USER_CHAR_LIMIT);
  });
});

describe("applyAddEntry", () => {
  it("追加新条目", () => {
    const r = applyAddEntry("", "第一条", 100);
    expect(r.duplicate).toBe(false);
    expect(r.entries).toEqual(["第一条"]);
    expect(r.content).toBe("第一条");
  });
  it("幂等去重：同内容不重复入库", () => {
    const r = applyAddEntry("客户A：偏好简约", "客户A：偏好简约", 100);
    expect(r.duplicate).toBe(true);
    expect(r.entries).toHaveLength(1);
    expect(r.content).toBe("客户A：偏好简约");
  });
  it("超字符上限时逐出最旧条目", () => {
    // 上限 12：拼接后 18 字符，逐出最旧一条后 11 字符符合上限
    const r = applyAddEntry("旧条目一 § 旧条目二", "新条目三", 12);
    expect(r.evicted).toEqual(["旧条目一"]);
    expect(r.entries).toEqual(["旧条目二", "新条目三"]);
    expect(r.content).toBe("旧条目二 § 新条目三");
  });
});

describe("applyRemoveEntry", () => {
  it("按文本移除命中条目", () => {
    const r = applyRemoveEntry("客户A：偏好简约 § 企业B：制度", "客户A：偏好简约");
    expect(r.entries).toEqual(["企业B：制度"]);
  });
  it("未命中不报错、内容不变", () => {
    const r = applyRemoveEntry("客户A：偏好简约", "不存在的条目");
    expect(r.entries).toEqual(["客户A：偏好简约"]);
  });
});

describe("applyReplaceEntry", () => {
  it("替换命中条目", () => {
    const r = applyReplaceEntry("客户A：偏好简约", "客户A：偏好简约", "客户A：偏好轻奢", 100);
    expect(r.entries).toEqual(["客户A：偏好轻奢"]);
  });
  it("未命中则追加为新条目", () => {
    const r = applyReplaceEntry("客户A：偏好简约", "客户B：无记录", "客户B：偏好现代", 100);
    expect(r.entries).toEqual(["客户A：偏好简约", "客户B：偏好现代"]);
  });
});
import {
  parseMemoryCards,
  parseJourneyJson,
} from "../../electron/main/hermes-evolution";

describe("parseMemoryCards", () => {
  it("按 § 分隔成卡片并过滤空块", () => {
    const cards = parseMemoryCards("memory", "卡片一 § 卡片二 §  § 卡片三");
    expect(cards).toHaveLength(3);
    expect(cards[0]).toEqual({ source: "memory", text: "卡片一" });
    expect(cards[2].text).toBe("卡片三");
  });
  it("空内容 → 空数组", () => {
    expect(parseMemoryCards("profile", "")).toEqual([]);
    expect(parseMemoryCards("profile", "   §  §  ")).toEqual([]);
  });
  it("无 § 单块 → 整体一张卡", () => {
    const cards = parseMemoryCards("profile", "我是用户画像");
    expect(cards).toEqual([{ source: "profile", text: "我是用户画像" }]);
  });
});

describe("parseJourneyJson", () => {
  it("解析对象 JSON", () => {
    const out = parseJourneyJson(JSON.stringify({ nodes: [{ id: "a" }] }));
    expect(out).not.toBeNull();
    expect(out!.nodes).toHaveLength(1);
  });
  it("容错前后杂文本", () => {
    const out = parseJourneyJson("rendering...\\n" + JSON.stringify({ nodes: [] }) + "\\nfooter");
    expect(out).not.toBeNull();
    expect(Array.isArray(out!.nodes)).toBe(true);
  });
  it("无 JSON → null", () => {
    expect(parseJourneyJson("no graph yet")).toBeNull();
  });
});

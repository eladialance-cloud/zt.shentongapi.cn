import { checkProfile, BANNED_TOKENS, REQUIRED_SECTIONS } from "../../scripts/content-license";

describe("content-license", () => {
  it("rejects RRClaw 品牌词", () => {
    const r = checkProfile({ content: "这是 RRClaw 的造造天幕 SOUL。", role: "hongshang" });
    expect(r.pass).toBe(false);
    expect(r.banned).toContain("RRClaw");
  });
  it("通过符合结构且无品牌词的 SOUL", () => {
    const r = checkProfile({
      content: "# 深瞳·销售经理\n## 角色定位\n## 工作职责\n## 工作流程\n## 协作关系\n## 边界与禁用\n",
      role: "sales",
    });
    expect(r.pass).toBe(true);
  });
  it("缺失关键小节时判否", () => {
    const r = checkProfile({ content: "# 深瞳·销售经理\n", role: "sales" });
    expect(r.missingSections.length).toBeGreaterThan(0);
  });
});

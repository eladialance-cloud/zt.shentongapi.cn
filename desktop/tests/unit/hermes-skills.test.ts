import {
  parseSkillsList,
  parseSkillsSearch,
} from "../../electron/main/hermes-skills";

const BUILTIN = ["st-claw-controller", "video-claw"];

describe("parseSkillsList", () => {
  it("解析 JSON 数组输出（含 source/version）", () => {
    const stdout = JSON.stringify([
      { name: "st-claw-controller", source: "builtin", version: "1.0.0" },
      { name: "skill-creator", source: "hub", version: "2.1.0" },
    ]);
    const items = parseSkillsList(stdout, BUILTIN);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "st-claw-controller", builtin: true });
    expect(items[1]).toMatchObject({ name: "skill-creator", builtin: false });
  });
  it("兼容 ```json 代码块包裹", () => {
    const stdout = "```json\\n" + JSON.stringify([{ name: "video-claw", version: "1.2.0" }]) + "\\n```";
    const items = parseSkillsList(stdout, BUILTIN);
    expect(items[0]).toMatchObject({ name: "video-claw", builtin: true });
  });
  it("表格文本输出 → 提取第一列技能名（跳过表头）", () => {
    const stdout = [
      "              Installed Skills               ",
      "┌──────┬──────────┬────────┬───────┬────────┐",
      "│ Name │ Category │ Source │ Trust │ Status │",
      "├──────┼──────────┼────────┼───────┼────────┤",
      "│ st-claw-controller │ video │ builtin │ full │ enabled │",
      "│ skill-creator │ general │ hub │ full │ enabled │",
      "└──────┴──────────┴────────┴───────┴────────┘",
    ].join("\n");
    const items = parseSkillsList(stdout, BUILTIN);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.some((i) => i.name === "st-claw-controller" && i.builtin === true)).toBe(true);
    expect(items.some((i) => i.name === "skill-creator" && i.builtin === false)).toBe(true);
  });
});

describe("parseSkillsSearch", () => {
  it("解析搜索 JSON 结果", () => {
    const stdout = JSON.stringify([{ id: "openai/skills/skill-creator", source: "github" }]);
    const items = parseSkillsSearch(stdout);
    expect(items[0]).toMatchObject({ name: "openai/skills/skill-creator", source: "github" });
  });
  it("无 JSON → 空数组", () => {
    expect(parseSkillsSearch("no results")).toEqual([]);
  });
});

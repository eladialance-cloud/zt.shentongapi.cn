import { cleanCsvRows } from "../../scripts/import-keywords";

describe("import-keywords / cleanCsvRows", () => {
  it("去重去品牌（计划用例：去重保序、仅校验 prompt 字段）", () => {
    const out = cleanCsvRows(["开界爆款,A", "RRClaw,B", "开界爆款,A"]);
    expect(out).toEqual([{ prompt: "A" }, { prompt: "B" }]);
  });

  it("剔除 prompt 含品牌词的行", () => {
    const out = cleanCsvRows([
      "title,这是RRClaw爆款文案",
      "title,这是一条干净爆款文案",
      "title,Siver提示词",
    ]);
    expect(out).toEqual([{ prompt: "这是一条干净爆款文案" }]);
  });

  it("忽略空行并 trim 首尾空白", () => {
    const out = cleanCsvRows([
      "title,  爆款文案  ",
      "   ",
      "",
      "title,  爆款文案  ",
    ]);
    expect(out).toEqual([{ prompt: "爆款文案" }]);
  });

  it("去重后保持原顺序", () => {
    const out = cleanCsvRows(["title,B", "title,A", "title,B", "title,C"]);
    expect(out).toEqual([{ prompt: "B" }, { prompt: "A" }, { prompt: "C" }]);
  });
});

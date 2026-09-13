import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkProfile } from "../../scripts/content-license";

const ROLES = [
  "taizi",
  "bingbu",
  "gongbu",
  "xingbu",
  "qintianjian",
  "zaochao",
] as const;

describe("soul batch-2（职能/管理角色 SOUL 合规）", () => {
  for (const role of ROLES) {
    it(`${role} profile 通过内容合规校验`, () => {
      const file = join(__dirname, "../../resources/edict/profiles", `${role}.md`);
      const content = readFileSync(file, "utf8");
      const result = checkProfile({ content, role });
      expect(result.banned).toEqual([]);
      expect(result.missingSections).toEqual([]);
      expect(result.pass).toBe(true);
    });
  }
});

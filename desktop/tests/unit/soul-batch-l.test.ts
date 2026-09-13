import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkProfile } from "../../scripts/content-license";

const PROFILES_DIR = join(process.cwd(), "resources", "edict", "profiles");

const ROLES = ["shangshu", "hubu", "libu", "libu_hr", "menxia", "zhongshu"];

describe("soul-batch-l (business roles)", () => {
  for (const role of ROLES) {
    it(`${role} profile 通过内容合规校验`, () => {
      const content = readFileSync(join(PROFILES_DIR, `${role}.md`), "utf8");
      const result = checkProfile({ content, role });
      expect(result.banned).toEqual([]);
      expect(result.missingSections).toEqual([]);
      expect(result.pass).toBe(true);
    });
  }
});

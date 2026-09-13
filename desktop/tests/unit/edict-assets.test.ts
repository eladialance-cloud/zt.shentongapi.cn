import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkProfile, BANNED_TOKENS } from "../../scripts/content-license";

const EDICT_ROLES_DIR = join(__dirname, "../../resources/edict/roles");
const EDICT_DATA_DIR = join(__dirname, "../../resources/edict/data");

const DEEP_EYE_ROLES = [
  "bingbu",
  "gongbu",
  "hubu",
  "libu_hr",
  "libu",
  "menxia",
  "qintianjian",
  "shangshu",
  "taizi",
  "xingbu",
  "zaochao",
  "zhongshu",
] as const;

describe("edict-assets（Task 4 内容资产底座）", () => {
  const files = {
    roles: join(EDICT_ROLES_DIR, "岗位职责表.md"),
    field: join(EDICT_DATA_DIR, "多维表格字段设计规范.md"),
    env: join(EDICT_DATA_DIR, "落地配置模板.env.example"),
  };

  it("三份资产文件均存在", () => {
    for (const f of Object.values(files)) {
      expect(existsSync(f)).toBe(true);
    }
  });

  it("岗位职责表覆盖 12 岗位且无品牌 token", () => {
    const content = readFileSync(files.roles, "utf8");
    const r = checkProfile({ content, role: "asset" });
    expect(r.banned).toEqual([]);
    for (const role of DEEP_EYE_ROLES) expect(content).toContain(role);
    for (const kw of ["核心定位", "核心职责", "产出标准", "考核指标"]) {
      expect(content).toContain(kw);
    }
  });

  it("多维表格字段规范含 字段名/类型/必填 且无品牌 token", () => {
    const content = readFileSync(files.field, "utf8");
    const r = checkProfile({ content, role: "asset" });
    expect(r.banned).toEqual([]);
    for (const kw of ["字段名", "类型", "必填"]) {
      expect(content).toContain(kw);
    }
    expect(content).toMatch(/\|\s*字段名\s*\|\s*类型\s*\|\s*必填\s*\|/);
  });

  it("落地配置模板只含键名占位、无品牌 token、无真实密钥", () => {
    const content = readFileSync(files.env, "utf8");
    for (const t of BANNED_TOKENS) expect(content).not.toContain(t);
    for (const key of ["ST_API_BASE", "N8N_BASE_URL", "HERMES_HOME", "EDICT_HOME"]) {
      expect(content).toContain(key);
    }

    const SECRET_PAT =
      /(sk-[A-Za-z0-9]{10,}|AIza[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN[A-Z ]+PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|[A-Za-z0-9+/=_]{40,})/;
    const keyLines = content.split(/\r?\n/).filter((l) => /^[A-Z0-9_]+\s*=/.test(l));
    for (const line of keyLines) {
      expect(line).not.toMatch(SECRET_PAT);
    }
  });
});

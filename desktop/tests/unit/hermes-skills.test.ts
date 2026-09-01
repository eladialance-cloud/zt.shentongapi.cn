import { HermesClient } from "../../electron/main/hermes-client";
import {
  listSkills,
  searchSkills,
  installSkill,
  updateSkills,
  uninstallSkill,
  parseSkillsList,
  parseSkillsSearch,
} from "../../electron/main/hermes-skills";

jest.mock("electron", () => ({
  app: {
    getPath: jest.fn(() => "C:/test/userData"),
    isPackaged: false,
  },
  safeStorage: {
    isEncryptionAvailable: jest.fn(() => false),
    encryptString: jest.fn((s: string) => Buffer.from(s, "utf8") as unknown as Buffer),
    decryptString: jest.fn((b: Buffer) => b.toString("utf8")),
  },
}));

jest.mock("../../electron/main/hermes-client");

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

describe("原生优先 + CLI 降级", () => {
  type MockClientShape = {
    listSkills: jest.Mock;
    searchSkills: jest.Mock;
    installSkill: jest.Mock;
    uninstallSkill: jest.Mock;
    updateSkills: jest.Mock;
  };
  let mockClient: MockClientShape;
  const ClientCtor = HermesClient as unknown as jest.Mock;

  beforeEach(() => {
    mockClient = {
      listSkills: jest.fn(),
      searchSkills: jest.fn(),
      installSkill: jest.fn(),
      uninstallSkill: jest.fn(),
      updateSkills: jest.fn(),
    };
    ClientCtor.mockImplementation(() => mockClient);
  });

  it("listSkills 原生成功：provenance/version 映射，bundled → builtin", async () => {
    mockClient.listSkills.mockResolvedValue([
      { name: "my-agent-skill", provenance: "agent", version: "1.0.0" },
      { name: "video-claw", provenance: "bundled" },
      { name: "skill-creator", provenance: "hub", version: "2.1.0" },
    ]);
    const res = await listSkills();
    expect(res.ok).toBe(true);
    expect(res.items).toEqual([
      expect.objectContaining({ name: "my-agent-skill", source: "agent", version: "1.0.0", builtin: false }),
      expect.objectContaining({ name: "video-claw", source: "builtin", builtin: true }),
      expect.objectContaining({ name: "skill-creator", source: "hub", version: "2.1.0", builtin: false }),
    ]);
  });

  it("listSkills 原生失败 → 降级 CLI（运行时未安装时 ok:false 且带错误）", async () => {
    mockClient.listSkills.mockRejectedValue(new Error("connection refused"));
    const res = await listSkills();
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("searchSkills 原生成功：identifier 作为安装标识、source 兜底 trust_level", async () => {
    mockClient.searchSkills.mockResolvedValue({
      results: [
        { identifier: "openai/skills/skill-creator", source: "github", trust_level: "trusted" },
        { identifier: "other/skill", trust_level: "community" },
      ],
    });
    const res = await searchSkills("skill-creator");
    expect(res.ok).toBe(true);
    expect(res.items).toEqual([
      expect.objectContaining({ name: "openai/skills/skill-creator", source: "github" }),
      expect.objectContaining({ name: "other/skill", source: "community" }),
    ]);
  });

  it("searchSkills 原生失败 → 降级 CLI 仍返回结构", async () => {
    mockClient.searchSkills.mockRejectedValue(new Error("connection refused"));
    const res = await searchSkills("skill-creator");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("installSkill 原生成功：后台异步启动返回提示", async () => {
    mockClient.installSkill.mockResolvedValue({ ok: true, pid: 4321, name: "install-x" });
    const res = await installSkill("openai/skills/skill-creator");
    expect(res.ok).toBe(true);
    expect(res.stdout).toContain("后台");
    expect(mockClient.installSkill).toHaveBeenCalledWith("openai/skills/skill-creator");
  });

  it("installSkill 原生失败 → 降级 CLI（运行时未安装时 ok:false）", async () => {
    mockClient.installSkill.mockRejectedValue(new Error("connection refused"));
    const res = await installSkill("openai/skills/skill-creator");
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("updateSkills 指定 name 时原生不支持单技能，直接走 CLI（不调用原生）", async () => {
    const res = await updateSkills("skill-creator");
    expect(mockClient.updateSkills).not.toHaveBeenCalled();
    expect(res.ok).toBe(false);
    expect(res.error).toBeTruthy();
  });

  it("updateSkills 未指定 name 时原生优先", async () => {
    mockClient.updateSkills.mockResolvedValue({ ok: true, pid: 100, name: "skills-update" });
    const res = await updateSkills();
    expect(res.ok).toBe(true);
    expect(mockClient.updateSkills).toHaveBeenCalledWith();
  });

  it("uninstallSkill 原生成功", async () => {
    mockClient.uninstallSkill.mockResolvedValue({ ok: true, pid: 55, name: "uninstall-x" });
    const res = await uninstallSkill("video-claw");
    expect(res.ok).toBe(true);
    expect(mockClient.uninstallSkill).toHaveBeenCalledWith("video-claw");
  });
});

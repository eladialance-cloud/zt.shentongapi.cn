import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BANNED_TOKENS } from "../../scripts/content-license";

const MODULE_DIR = join(__dirname, "../../resources/service-registry/modules/st-employee-sales");

describe("agent-mount（Task 5 角色 agent 挂载）", () => {
  it("module.yaml 声明 kind: agent 且 target: hermes", () => {
    const yaml = readFileSync(join(MODULE_DIR, "module.yaml"), "utf8");
    expect(yaml).toContain("kind: agent");
    expect(yaml).toContain("target: hermes");
  });

  it("agent.json systemPrompt 超过 50 字且不含品牌词", () => {
    const raw = readFileSync(join(MODULE_DIR, "agent/agent.json"), "utf8");
    const agent = JSON.parse(raw) as { systemPrompt: string };
    expect(agent.systemPrompt.length).toBeGreaterThan(50);
    for (const t of BANNED_TOKENS) {
      expect(agent.systemPrompt).not.toContain(t);
    }
  });
});

// Hermes 斜杠命令解析单测（slash.ts 纯函数）
import { parseSlashCommand, LOCAL_COMMAND_NAMES, AGENT_ONLY_COMMAND_NAMES, SLASH_HELP } from "@/pages/HermesChat/slash";

describe("parseSlashCommand 斜杠命令解析", () => {
  it("解析 /new 无参数", () => {
    expect(parseSlashCommand("/new")).toEqual({ raw: "/new", name: "new", args: "" });
  });

  it("解析 /model gpt-4o 带参数", () => {
    const r = parseSlashCommand("/model gpt-4o");
    expect(r?.name).toBe("model");
    expect(r?.args).toBe("gpt-4o");
  });

  it("支持大小写与多余前后空格", () => {
    const r = parseSlashCommand("  /HELP  ");
    expect(r?.name).toBe("help");
    expect(r?.args).toBe("");
  });

  it("普通文本不解析", () => {
    expect(parseSlashCommand("你好，帮我写代码")).toBeNull();
    expect(parseSlashCommand("")).toBeNull();
    expect(parseSlashCommand("/")).toBeNull();
  });

  it("本地命令集包含常用项与本地 Agent 命令", () => {
    expect(LOCAL_COMMAND_NAMES.has("new")).toBe(true);
    expect(LOCAL_COMMAND_NAMES.has("usage")).toBe(true);
    expect(LOCAL_COMMAND_NAMES.has("persona")).toBe(true);
    expect(LOCAL_COMMAND_NAMES.has("model")).toBe(true);
    expect(LOCAL_COMMAND_NAMES.has("image")).toBe(true);
    expect(LOCAL_COMMAND_NAMES.has("video")).toBe(true);
    expect(LOCAL_COMMAND_NAMES.has("status")).toBe(true);
    expect(LOCAL_COMMAND_NAMES.has("undo")).toBe(true);
    expect(LOCAL_COMMAND_NAMES.has("compact")).toBe(true);
  });

  it("Agent 网关命令集仅保留 web/browse/code/shell", () => {
    expect(AGENT_ONLY_COMMAND_NAMES.has("web")).toBe(true);
    expect(AGENT_ONLY_COMMAND_NAMES.has("browse")).toBe(true);
    expect(AGENT_ONLY_COMMAND_NAMES.has("code")).toBe(true);
    expect(AGENT_ONLY_COMMAND_NAMES.has("shell")).toBe(true);
    expect(AGENT_ONLY_COMMAND_NAMES.has("image")).toBe(false);
    expect(AGENT_ONLY_COMMAND_NAMES.has("compact")).toBe(false);
  });

  it("SLASH_HELP 含关键命令说明", () => {
    expect(SLASH_HELP).toContain("/new");
    expect(SLASH_HELP).toContain("/usage");
    expect(SLASH_HELP).toContain("/image");
    expect(SLASH_HELP).toContain("/help");
    expect(SLASH_HELP).toContain("/status");
  });
});

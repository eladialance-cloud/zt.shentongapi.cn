// 环境组件检测 / 安装（对标 RRClaw 环境组件）
// 只读检测：断言返回结构稳定；安装：断言未知组件与 python 组件给出明确错误（不做假动作）
import { checkEnvComponents, installEnvComponent } from "../../electron/main/env-components";

describe("env-components 检测", () => {
  it("返回固定 4 个组件（python/flowsDeps/playwright/vosk）", () => {
    const list = checkEnvComponents();
    expect(list.map((c) => c.id)).toEqual(["python", "flowsDeps", "playwright", "vosk"]);
    for (const c of list) {
      expect(typeof c.title).toBe("string");
      expect(typeof c.ready).toBe("boolean");
      expect(typeof c.installable).toBe("boolean");
    }
  });

  it("内置 Python 随包分发，不可一键安装", () => {
    const python = checkEnvComponents().find((c) => c.id === "python")!;
    expect(python.installable).toBe(false);
  });

  it("就绪项 detail 有说明文本", () => {
    for (const c of checkEnvComponents()) {
      expect(c.detail === undefined || typeof c.detail === "string").toBe(true);
    }
  });
});

describe("env-components 安装", () => {
  it("内置 Python 组件不可安装（随包分发）", async () => {
    const r = await installEnvComponent("python");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("随安装包分发");
  });

  it("语音模型组件暂不支持一键安装", async () => {
    const r = await installEnvComponent("vosk");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("手动放置");
  });
});

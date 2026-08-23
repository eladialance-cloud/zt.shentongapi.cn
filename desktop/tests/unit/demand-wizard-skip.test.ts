// 需求向导「跳过」按钮复现测试：老板模式线性流程，点击跳过应从可跳过步推进到下一步
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { DemandWizard } from "../../src/pages/Chat/DemandMode";

// jsdom 缺 matchMedia（antd 组件依赖）
if (typeof window !== "undefined" && !window.matchMedia) {
  (window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

function setTextarea(el: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function clickButtonByText(text: string): boolean {
  const target = text.replace(/\s+/g, "");
  const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").replace(/\s+/g, "") === target);
  if (!btn) return false;
  btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return true;
}

function bodyText(): string {
  return (document.body.textContent || "").replace(/\s+/g, " ");
}

describe("DemandWizard 老板模式 · 跳过", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(async () => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(DemandWizard, { mode: "boss", onPublish: () => undefined }));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    document.body.innerHTML = "";
  });

  it("第一步：任务必填 → 输入后进入目标步", async () => {
    expect(bodyText()).toContain("这次想做什么");
    const ta = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(ta).toBeTruthy();
    await act(async () => {
      setTextarea(ta, "为新品写 3 条文案");
    });
    await act(async () => {
      clickButtonByText("发送");
    });
    expect(bodyText()).toContain("核心目标是");
  });

  it("可跳过步（受众）点跳过 → 应推进到平台步", async () => {
    await act(async () => {
      setTextarea(document.querySelector("textarea") as HTMLTextAreaElement, "为新品写 3 条文案");
    });
    await act(async () => {
      clickButtonByText("发送");
    });
    await act(async () => {
      setTextarea(document.querySelector("textarea") as HTMLTextAreaElement, "涨粉");
    });
    await act(async () => {
      clickButtonByText("发送");
    });
    expect(bodyText()).toContain("目标受众是谁");
    expect(clickButtonByText("跳过")).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(bodyText()).toContain("发布平台");
    expect(bodyText()).toContain("（跳过）");
  });

  it("自然语言预填平台后跳过受众 → 应直接到风格步（不重复问平台）", async () => {
    // 任务含小红书 → 自动填平台，跳到目标步
    await act(async () => {
      setTextarea(document.querySelector("textarea") as HTMLTextAreaElement, "为新品写 3 条小红书种草文案");
    });
    await act(async () => {
      clickButtonByText("发送");
    });
    expect(bodyText()).toContain("核心目标是");
    await act(async () => {
      setTextarea(document.querySelector("textarea") as HTMLTextAreaElement, "涨粉");
    });
    await act(async () => {
      clickButtonByText("发送");
    });
    expect(bodyText()).toContain("目标受众是谁");
    expect(clickButtonByText("跳过")).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    // 平台已由自然语言预填 → 不再问平台，直接问风格
    expect(bodyText()).not.toContain("发布平台");
    expect(bodyText()).not.toContain("风格参考");
    expect(bodyText()).toContain("素材");
  });
});

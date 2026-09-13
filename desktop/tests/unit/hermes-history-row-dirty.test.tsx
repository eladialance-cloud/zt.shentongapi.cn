// 回归：历史 toolCalls 脏数据曾让「Hermes 对话」页整页白屏
// TypeError: Cannot read properties of undefined (reading 'includes')
//   at humanizeToolName (HistoryRow.tsx) at ToolActivityItem
// 这里用 SSR 直接渲染工具行，保证渲染层再也不会抛。

import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from "util";
import { ToolActivityGroup } from "@/pages/HermesChat/upstream/HistoryRow";
import type {
  ToolCallMessage,
  ToolResultMessage,
} from "@/pages/HermesChat/upstream/types";

// react-markdown / remark-gfm / lucide-react 是 ESM，jest 默认不转译它们；这里直接打桩。
jest.mock("react-markdown", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: (props: { children?: unknown }) =>
      React.createElement("div", null, props.children ?? null),
  };
});
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => undefined }));
jest.mock("lucide-react", () => {
  const React = require("react");
  const Icon = () => React.createElement("span", null);
  return new Proxy(
    { __esModule: true },
    { get: (target: Record<string, unknown>, key: string) => (key === "__esModule" ? true : Icon) },
  );
});

// jsdom 环境没有 TextEncoder，react-dom/server 需要；先补齐再加载它。
const globals = globalThis as unknown as Record<string, unknown>;
globals.TextEncoder = globals.TextEncoder ?? NodeTextEncoder;
globals.TextDecoder = globals.TextDecoder ?? NodeTextDecoder;
const { renderToStaticMarkup } =
  require("react-dom/server") as typeof import("react-dom/server");

type ToolItem = ToolCallMessage | ToolResultMessage;

function items(raw: unknown[]): ToolItem[] {
  return raw as ToolItem[];
}

describe("Hermes 历史工具行（脏数据防御）", () => {
  it("name 缺失的工具调用行能渲染（原崩溃点）", () => {
    const dirty = items([
      { id: "tc-1", kind: "tool_call", role: "agent", callId: "1", status: "completed" },
    ]);
    expect(() => renderToStaticMarkup(<ToolActivityGroup items={dirty} />)).not.toThrow();
    expect(renderToStaticMarkup(<ToolActivityGroup items={dirty} />)).toContain("Tool");
  });

  it("name 非字符串（数字/对象/数组）也不抛", () => {
    for (const badName of [42, {}, [], true]) {
      const dirty = items([
        { id: "tc-1", kind: "tool_call", role: "agent", callId: "1", name: badName },
      ]);
      expect(() =>
        renderToStaticMarkup(<ToolActivityGroup items={dirty} />),
      ).not.toThrow();
    }
  });

  it("args/content 是对象时不抛（React 不接受对象子节点）", () => {
    const dirty = items([
      { id: "tc-1", kind: "tool_call", role: "agent", callId: "1", name: "x", args: { a: 1 } },
      { id: "tr-1", kind: "tool_result", role: "agent", callId: "1", name: "x", content: { b: 2 } },
    ]);
    expect(() => renderToStaticMarkup(<ToolActivityGroup items={dirty} />)).not.toThrow();
  });

  it("数组里混入 null/undefined 行也不抛", () => {
    const dirty = items([null, undefined, { id: "tc-1", kind: "tool_call", role: "agent", callId: "1" }]);
    expect(() => renderToStaticMarkup(<ToolActivityGroup items={dirty} />)).not.toThrow();
  });
});

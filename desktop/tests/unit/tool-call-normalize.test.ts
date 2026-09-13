import {
  normalizeToolCall,
  normalizeToolCalls,
  toolCallText,
} from "@/utils/tool-call-normalize";
import { humanizeToolName, iconKeyForTool } from "@/pages/HermesChat/upstream/toolMeta";

describe("normalizeToolCalls（历史 toolCalls 形状容错）", () => {
  it("深瞳自有形状原样通过", () => {
    const [tc] = normalizeToolCalls([
      { id: "1", name: "execute_code", input: { a: 1 }, output: "ok", status: "success" },
    ]);
    expect(tc).toEqual({
      id: "1",
      name: "execute_code",
      input: { a: 1 },
      output: "ok",
      status: "success",
    });
  });

  it("OpenAI function 形状取到 function.name（旧版本写入的历史）", () => {
    const [tc] = normalizeToolCalls([
      { id: "call_1", type: "function", function: { name: "read_file", arguments: "{\"path\":\"a\"}" } },
    ]);
    expect(tc.name).toBe("read_file");
    expect(tc.id).toBe("call_1");
    expect(tc.input).toBe("{\"path\":\"a\"}");
  });

  it("旧别名字段 toolName/tool_name/label/tool 都能取到名字", () => {
    expect(normalizeToolCalls([{ id: "1", toolName: "web_search" }])[0].name).toBe("web_search");
    expect(normalizeToolCalls([{ id: "2", tool_name: "browser" }])[0].name).toBe("browser");
    expect(normalizeToolCalls([{ id: "3", label: "shell" }])[0].name).toBe("shell");
    expect(normalizeToolCalls([{ id: "4", tool: "n8n-run-workflow" }])[0].name).toBe("n8n-run-workflow");
  });

  it("双编码 JSON 串（整列被当成字符串返回）不会逐字符解析", () => {
    const raw = '[{"id":"1","name":"execute_code","input":{"x":1}}]';
    const list = normalizeToolCalls(raw);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("execute_code");
  });

  it("缺名字的记录兜底为 tool，绝不返回 undefined", () => {
    const [tc] = normalizeToolCalls([{ id: "9", input: { q: 1 } }]);
    expect(tc.name).toBe("tool");
    expect(typeof tc.name).toBe("string");
  });

  it("脏载荷（null/数字/非工具对象/空串）返回空数组", () => {
    expect(normalizeToolCalls(null)).toEqual([]);
    expect(normalizeToolCalls(undefined)).toEqual([]);
    expect(normalizeToolCalls(123)).toEqual([]);
    expect(normalizeToolCalls("")).toEqual([]);
    expect(normalizeToolCalls("not json")).toEqual([]);
    expect(normalizeToolCalls([null, 7, { foo: "bar" }])).toEqual([]);
  });

  it("脏元素被丢弃、正常元素保留，顺序不变", () => {
    const list = normalizeToolCalls([null, { name: "a" }, { foo: 1 }, { name: "b" }]);
    expect(list.map((t) => t.name)).toEqual(["a", "b"]);
  });

  it("单个对象（非数组）也按一条处理", () => {
    expect(normalizeToolCall({ name: "solo" })?.name).toBe("solo");
    expect(normalizeToolCall("string")).toBeNull();
    expect(normalizeToolCall(null)).toBeNull();
  });

  it("status 归一化：failed/running/其它→success/缺失→undefined", () => {
    expect(normalizeToolCalls([{ name: "x", status: "failed" }])[0].status).toBe("failed");
    expect(normalizeToolCalls([{ name: "x", status: "running" }])[0].status).toBe("running");
    expect(normalizeToolCalls([{ name: "x", status: "completed" }])[0].status).toBe("success");
    expect(normalizeToolCalls([{ name: "x" }])[0].status).toBeUndefined();
  });
});

describe("toolCallText", () => {
  it("字符串原样、对象序列化、null/undefined 给空串", () => {
    expect(toolCallText("abc")).toBe("abc");
    expect(toolCallText({ a: 1 })).toBe('{"a":1}');
    expect(toolCallText(null)).toBe("");
    expect(toolCallText(undefined)).toBe("");
  });
});

describe("humanizeToolName / iconKeyForTool（上游渲染防御）", () => {
  it("正常名字照旧", () => {
    expect(humanizeToolName("execute_code")).toBe("Execute Code");
    expect(humanizeToolName("mcp__server__read_file")).toBe("Read File");
    expect(iconKeyForTool("web_search")).toBe("web");
  });

  it("undefined/null/空串/非字符串不再抛错（原线上崩溃点）", () => {
    for (const bad of [undefined, null, "", "   ", 42, {}, []]) {
      expect(() => humanizeToolName(bad)).not.toThrow();
      expect(() => iconKeyForTool(bad)).not.toThrow();
      expect(typeof humanizeToolName(bad)).toBe("string");
      expect(humanizeToolName(bad)).toBe("Tool");
      expect(iconKeyForTool(bad)).toBe("");
    }
  });
});

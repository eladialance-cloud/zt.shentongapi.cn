import { parseHermesResult, parseStepResult, extractReasoning } from "../../electron/main/hermes-result";

describe("parseHermesResult", () => {
  it("解析单行 JSON（含 summary/steps/outputs）", () => {
    const stdout = '{"summary":"已完成3条文案","steps":[{"name":"需求理解","status":"done"},{"name":"文案撰写","status":"done","outputs":[{"type":"text","content":"文案1"}]}],"outputs":[{"type":"text","content":"文案1"}]}';
    const r = parseHermesResult(stdout, 1200);
    expect(r.status).toBe("completed");
    expect(r.summary).toBe("已完成3条文案");
    expect(r.steps).toHaveLength(2);
    expect(r.steps[1].outputs?.[0]).toEqual({ type: "text", content: "文案1" });
    expect(r.outputs).toHaveLength(1);
  });

  it("step 携带执行成员（团队驱动执行）", () => {
    const stdout = '{"summary":"已完成","steps":[{"name":"文案撰写","status":"done","assigneeName":"内容AI","assigneeMemberId":12}]}';
    const r = parseHermesResult(stdout, 10);
    expect(r.steps[0].assigneeName).toBe("内容AI");
    expect(r.steps[0].assigneeMemberId).toBe(12);
  });

  it("解析 ```json 代码块包裹的 JSON", () => {
    const stdout = '```json\n{"summary":"ok","outputs":[{"type":"video","url":"http://127.0.0.1:8000/code/result/video/a.mp4"}]}\n```';
    const r = parseHermesResult(stdout, 100);
    expect(r.summary).toBe("ok");
    expect(r.outputs[0].url).toContain("/code/result/video/");
  });

  it("非 JSON 纯文本 → 降级为 summary=全文，status=completed", () => {
    const r = parseHermesResult("好的，这是最终文案：\n第一条..", 50);
    expect(r.status).toBe("completed");
    expect(r.summary).toContain("第一条");
    expect(r.steps).toEqual([]);
  });

  it("status=failed 透传 + error 字段", () => {
    const r = parseHermesResult('{"status":"failed","summary":"模型未配置","error":"401"}', 30);
    expect(r.status).toBe("failed");
    expect(r.error).toBe("401");
  });

  it("空 stdout → summary 占位", () => {
    const r = parseHermesResult("   ", 10);
    expect(r.summary).toContain("无输出");
  });
});

describe("extractReasoning", () => {
  it("提取 JSON 前的思考文本并去空行", () => {
    const text = "我先分析需求：\n\n需要拆成两步。\n\n{\"steps\":[]}";
    expect(extractReasoning(text, 500)).toBe("我先分析需求：\n需要拆成两步。");
  });
  it("无 JSON → 返回空字符串", () => {
    expect(extractReasoning("纯文本，没有 JSON", 500)).toBe("");
  });
  it("超过 maxLen 截断", () => {
    const text = "A".repeat(100) + "\n{\"steps\":[]}";
    const r = extractReasoning(text, 20);
    expect(r.length).toBeLessThanOrEqual(20);
  });
});

describe("parseStepResult reasoning", () => {
  it("JSON 前思考文本 → reasoning", () => {
    const r = parseStepResult("思路：先整理资料。\n{\"summary\":\"完成\",\"outputs\":[{\"type\":\"text\",\"content\":\"x\"}]}");
    expect(r.reasoning).toContain("先整理资料");
  });
  it("纯 JSON → 无 reasoning", () => {
    const r = parseStepResult('{"summary":"完成"}');
    expect(r.reasoning).toBeUndefined();
  });
});

describe("parseHermesResult planReasoning", () => {
  it("JSON 前思考文本 → planReasoning", () => {
    const r = parseHermesResult("分析：该任务分 3 步。\n{\"summary\":\"ok\",\"steps\":[]}", 10);
    expect(r.planReasoning).toContain("分 3 步");
  });
});

describe("parseStepResult 健壮性（CLI 输出不稳定）", () => {
  it("多 JSON 事件流 → 取最后一个可解析（最终答案）", () => {
    const r = parseStepResult('{"type":"log","message":"开始执行"}\n中间说明\n{"summary":"完成","outputs":[{"type":"text","content":"x"}]}');
    expect(r.summary).toBe("完成");
    expect(r.outputs?.[0].content).toBe("x");
  });

  it("非 JSON 纯文本 → 全文作为文本产出收录（verdict pass，交由 Hermes 评审把关）", () => {
    const r = parseStepResult("调研完成：目标人群是 25-40 岁，主要痛点是时间碎片化。");
    expect(r.summary).toContain("调研完成");
    expect(r.outputs?.[0]).toEqual({ type: "text", content: "调研完成：目标人群是 25-40 岁，主要痛点是时间碎片化。" });
    expect(r.review?.verdict).toBe("pass");
  });

  it("JSON 只有 summary 无 outputs → 以 summary 作为文本产出", () => {
    const r = parseStepResult('{"summary":"完成","review":{"verdict":"pass"}}');
    expect(r.outputs?.[0]).toEqual({ type: "text", content: "完成" });
    expect(r.review?.verdict).toBe("pass");
  });
});

describe("extractReasoning 多 JSON / fenced", () => {
  it("多个 JSON 块时取最后一个 JSON 之前的文本", () => {
    const r = extractReasoning('{"log":"a"}\n思考过程\n{"steps":[]}', 500);
    expect(r).toContain("思考过程");
  });
  it("fenced JSON 不把围栏起始符当思考文本", () => {
    const tick = String.fromCharCode(96);
    const r = extractReasoning(tick.repeat(3) + "json\n{\"steps\":[]}\n" + tick.repeat(3), 500);
    expect(r).toBe("");
  });
});

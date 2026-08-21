import { parseHermesResult } from "../../electron/main/hermes-result";

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
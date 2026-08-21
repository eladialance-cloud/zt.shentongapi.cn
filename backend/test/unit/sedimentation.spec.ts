import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAnalyzeOutput,
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
} from "../../src/modules/sedimentation/sedimentation.service";

test("parseAnalyzeOutput：合法 JSON 正常解析", () => {
  const out = parseAnalyzeOutput(
    '{"type":"enterprise_doc","target":"knowledge_base","title":"公司制度","content":"打卡制度...","confidence":0.95}',
  );
  assert.ok(out);
  assert.equal(out!.type, "enterprise_doc");
  assert.equal(out!.target, "knowledge_base");
  assert.equal(out!.title, "公司制度");
  assert.equal(out!.confidence, 0.95);
});

test("parseAnalyzeOutput：置信度 <0.7 降级为 none", () => {
  const out = parseAnalyzeOutput(
    '{"type":"enterprise_doc","target":"knowledge_base","title":"x","content":"y","confidence":0.5}',
  );
  assert.ok(out);
  assert.equal(out!.type, "none");
  assert.equal(out!.target, null);
});

test("parseAnalyzeOutput：前后杂文本也能提取 JSON", () => {
  const out = parseAnalyzeOutput(
    '好的，分析如下：\n```json\n{"type":"customer_profile","target":"hermes_memory","title":"客户张总","content":"偏好微信沟通","confidence":0.9}\n```\n以上。',
  );
  assert.ok(out);
  assert.equal(out!.type, "customer_profile");
  assert.equal(out!.target, "hermes_memory");
});

test("parseAnalyzeOutput：非法类型返回 null", () => {
  assert.equal(parseAnalyzeOutput('{"type":"hack","target":null,"title":"","content":"","confidence":1}'), null);
});

test("parseAnalyzeOutput：非 JSON 返回 null", () => {
  assert.equal(parseAnalyzeOutput("完全没有 JSON 的输出"), null);
  assert.equal(parseAnalyzeOutput(""), null);
});

test("buildClassifySystemPrompt：包含关键规则", () => {
  const p = buildClassifySystemPrompt();
  assert.ok(p.includes("enterprise_doc"));
  assert.ok(p.includes("data_update"));
  assert.ok(p.includes("confidence"));
  assert.ok(p.includes("knowledge_base"));
});

test("buildClassifyUserPrompt：包含消息与上下文，最多 3 条上下文", () => {
  const history = ["h1", "h2", "h3", "h4"];
  const p = buildClassifyUserPrompt("新消息", history);
  assert.ok(p.includes("新消息"));
  assert.ok(p.includes("h2")); // 取最近 3 条
  assert.ok(p.includes("h4"));
  assert.ok(!p.includes("h1")); // 最旧的被截断
});
import {
  assertSubmittable,
  buildTaskPrompt,
  orchestrate,
  type OrchestrateInput,
  type OrchestrateDeps,
} from "../../electron/main/hermes-orchestrator";
import { buildMemberProfiles } from "../../electron/main/hermes-member-profile";

describe("assertSubmittable", () => {
  it("pending 可提交", () => {
    expect(assertSubmittable("pending")).toBe(true);
  });
  it("in_progress 拒绝重复提交（防并发双跑）", () => {
    expect(assertSubmittable("in_progress")).toBe(false);
  });
  it("completed/failed 不可重复提交", () => {
    expect(assertSubmittable("completed")).toBe(false);
    expect(assertSubmittable("failed")).toBe(false);
  });
});

describe("buildMemberProfiles（团队驱动执行）", () => {
  it("成员 + Agent 详情 → TeamMemberProfile[]", () => {
    const out = buildMemberProfiles([
      {
        id: 11, agentId: 21, roleTitle: "内容AI", roleDescription: "文案撰写",
        agent: { systemPrompt: "你是资深编辑", modelId: "gpt-4o", allowedKnowledgeBaseIds: [3] },
      },
    ]);
    expect(out).not.toBeNull();
    expect(out?.[0]).toMatchObject({
      memberId: 11, agentId: 21, roleTitle: "内容AI",
      systemPrompt: "你是资深编辑", modelId: "gpt-4o", knowledgeBaseIds: [3],
    });
  });
  it("无有效成员 → null（触发降级子代理）", () => {
    expect(buildMemberProfiles([])).toBeNull();
    expect(buildMemberProfiles([{ id: 1, agentId: 2, roleTitle: "x", agent: null }])).toBeNull();
  });
});

describe("buildTaskPrompt", () => {
  it("有成员清单 → 前缀注入花名册", () => {
    const prompt = buildTaskPrompt("写文案", [
      { memberId: 11, agentId: 21, roleTitle: "内容AI", roleDescription: "文案", systemPrompt: "资深编辑" },
    ]);
    expect(prompt).toContain("可用团队成员清单");
    expect(prompt).toContain("内容AI");
    expect(prompt).toContain("资深编辑");
    expect(prompt).toContain("写文案");
  });
  it("无成员 → 原样返回", () => {
    expect(buildTaskPrompt("写文案", undefined)).toBe("写文案");
    expect(buildTaskPrompt("写文案", null)).toBe("写文案");
    expect(buildTaskPrompt("写文案", [])).toBe("写文案");
  });
  it("有 modelDefaults → 注入媒体模型路由表", () => {
    const prompt = buildTaskPrompt("做一条宣传视频", undefined, {
      chat: "chat-a",
      vision: "vlm-b",
      image: "img-c",
      video: "vid-d",
      tts: "tts-e",
    });
    expect(prompt).toContain("【媒体模型路由表】");
    expect(prompt).toContain("默认模型：chat-a");
    expect(prompt).toContain("识图模型：vlm-b");
    expect(prompt).toContain("--action t2i/i2i --model img-c");
    expect(prompt).toContain("--action video --model vid-d");
    expect(prompt).toContain("tts-e");
    expect(prompt).toContain("做一条宣传视频");
  });
  it("modelDefaults 全空 → 不注入路由表", () => {
    expect(buildTaskPrompt("写文案", undefined, {})).toBe("写文案");
    expect(buildTaskPrompt("写文案", undefined, null)).toBe("写文案");
  });
  it("成员 + modelDefaults 同时存在 → 花名册与路由表并存", () => {
    const prompt = buildTaskPrompt("写文案", [
      { memberId: 11, agentId: 21, roleTitle: "内容AI" },
    ], { chat: "chat-a", image: "img-c" });
    expect(prompt).toContain("可用团队成员清单");
    expect(prompt).toContain("【媒体模型路由表】");
    expect(prompt).toContain("--model img-c");
  });
});

describe("orchestrate（状态机 + CLI + 回写）", () => {
  function makeInput(overrides: Partial<OrchestrateInput> = {}): OrchestrateInput {
    return {
      executionRef: "brief-1-x",
      teamTaskId: 5,
      teamId: 2,
      task: "写文案",
      ...overrides,
    };
  }
  function makeDeps(overrides: Partial<OrchestrateDeps> = {}): OrchestrateDeps {
    return {
      patchTask: jest.fn().mockResolvedValue(undefined),
      reportExecution: jest.fn().mockResolvedValue(undefined),
      persistOutputs: jest.fn().mockResolvedValue(undefined),
      spawnCli: jest.fn().mockReturnValue({
        child: { kill: jest.fn() },
        stdout: jest.fn().mockResolvedValue('{"summary":"ok","steps":[{"name":"a","status":"done","assigneeName":"内容AI"}],"outputs":[],"status":"completed"}'),
        stderr: jest.fn().mockResolvedValue(""),
      }),
      now: jest.fn().mockReturnValue(0),
      ...overrides,
    };
  }

  it("pending → in_progress → completed，回写 result + report + outputs", async () => {
    const deps = makeDeps();
    const r = await orchestrate(makeInput(), deps);
    const patchCalls = (deps.patchTask as jest.Mock).mock.calls;
    expect(patchCalls[0]).toEqual([2, 5, { status: "in_progress" }]);
    expect(patchCalls[1]).toEqual([
      2,
      5,
      { status: "completed", result: expect.objectContaining({ executionRef: "brief-1-x", status: "completed" }) },
    ]);
    expect(r.status).toBe("completed");
    expect(r.steps[0].assigneeName).toBe("内容AI");
    expect(deps.reportExecution).toHaveBeenCalledTimes(1);
    expect(deps.persistOutputs).toHaveBeenCalledWith(5, r);
  });

  it("CLI 异常 → status=failed + error，回写 failed", async () => {
    const deps = makeDeps({
      spawnCli: jest.fn().mockImplementation(() => {
        throw new Error("Hermes 未配置模型");
      }),
    });
    const r = await orchestrate(makeInput(), deps);
    expect(r.status).toBe("failed");
    expect(r.error).toContain("Hermes 未配置模型");
    const patchCalls = (deps.patchTask as jest.Mock).mock.calls;
    expect(patchCalls[patchCalls.length - 1]).toEqual([
      2,
      5,
      { status: "failed", result: expect.objectContaining({ status: "failed" }) },
    ]);
  });

  it("任务描述注入成员清单（团队驱动执行）", async () => {
    const deps = makeDeps();
    await orchestrate(makeInput({ teamMembers: [{ memberId: 11, agentId: 21, roleTitle: "内容AI" }] }), deps);
    const prompt = (deps.spawnCli as jest.Mock).mock.calls[0][0] as string;
    expect(prompt).toContain("可用团队成员清单");
    expect(prompt).toContain("内容AI");
  });
});
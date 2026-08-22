import {
  buildPlanPrompt,
  buildStepPrompt,
  createStepRunner,
  parsePlan,
  type OrchestrateInput,
  type StepRunnerDeps,
} from "../../electron/main/hermes-orchestrator";
import type { HermesOutput } from "../../electron/main/hermes-result";

/** 每步执行结果（自评 pass） */
const stepPass = (summary: string, content: string) =>
  JSON.stringify({
    summary,
    outputs: [{ type: "text", content }],
    review: { verdict: "pass", reason: "达标" },
  });

function makeInput(overrides: Partial<OrchestrateInput> = {}): OrchestrateInput {
  return {
    executionRef: "brief-1-x",
    teamTaskId: 5,
    teamId: 2,
    task: "做一条宣传视频",
    ...overrides,
  };
}

interface StepDepsHarness {
  deps: StepRunnerDeps;
  patches: Array<{ teamId: number; taskId: number; payload: Record<string, unknown> }>;
  reports: Array<Record<string, unknown>>;
  outputs: Array<{ taskId: number; outputs: HermesOutput[] }>;
  setAuto: (v: boolean) => void;
  setPlan: (stdout: string) => void;
  nextStepResult: (json: string) => void;
}

function makeDeps(): StepDepsHarness {
  const patches: StepDepsHarness["patches"] = [];
  const reports: StepDepsHarness["reports"] = [];
  const outputs: StepDepsHarness["outputs"] = [];
  let auto = false;
  let planStdout = JSON.stringify({
    steps: [
      { name: "调研", agentRole: "研究员" },
      { name: "成稿" },
    ],
  });
  const stepQueue: string[] = [];
  const deps: StepRunnerDeps = {
    runPrompt: jest.fn(async (prompt: string) => {
      const isPlan = prompt.includes("拆解为");
      if (isPlan) return { stdout: planStdout };
      const next = stepQueue.shift();
      if (next === undefined) throw new Error("未预置单步结果");
      return { stdout: next };
    }),
    patchTask: jest.fn(async (teamId, taskId, payload) => {
      patches.push({ teamId, taskId, payload });
    }),
    reportExecution: jest.fn(async (payload) => {
      reports.push(payload);
    }),
    persistOutputs: jest.fn(async (taskId, outs) => {
      outputs.push({ taskId, outputs: outs });
    }),
    isAutoConfirm: jest.fn(() => auto),
    now: jest.fn(() => 1000),
    maxRetries: 2,
  };
  return {
    deps,
    patches,
    reports,
    outputs,
    setAuto: (v) => {
      auto = v;
    },
    setPlan: (s) => {
      planStdout = s;
    },
    nextStepResult: (json) => {
      stepQueue.push(json);
    },
  };
}

async function until(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("等待条件超时");
    await new Promise((r) => setTimeout(r, 5));
  }
}

function patchSteps(h: StepDepsHarness): Array<Array<Record<string, unknown>>> {
  return h.patches
    .map((p) => (p.payload.result as { steps?: Array<Record<string, unknown>> } | undefined)?.steps)
    .filter((s): s is Array<Record<string, unknown>> => !!s);
}

function pendingReviewCount(h: StepDepsHarness, stepIndex: number): number {
  let n = 0;
  for (const steps of patchSteps(h)) {
    if (steps[stepIndex]?.rawStatus === "pending_review") n += 1;
  }
  return n;
}

describe("parsePlan", () => {
  it("解析单行 JSON → 节点清单", () => {
    expect(parsePlan('{"steps":[{"name":"调研","agentRole":"研究员"},{"name":"成稿"}]}')).toEqual([
      { name: "调研", agentRole: "研究员" },
      { name: "成稿" },
    ]);
  });
  it("解析 fenced json 围栏", () => {
    const tick = String.fromCharCode(96);
    const fenced = tick.repeat(3) + "json" + String.fromCharCode(10) + '{"steps":[{"name":"a"}]}' + String.fromCharCode(10) + tick.repeat(3);
    expect(parsePlan(fenced)).toEqual([{ name: "a" }]);
  });
  it("非法/空输出 → []", () => {
    expect(parsePlan("好的，我来拆解")).toEqual([]);
    expect(parsePlan("")).toEqual([]);
    expect(parsePlan('{"foo":1}')).toEqual([]);
  });
});

describe("buildPlanPrompt / buildStepPrompt", () => {
  it("规划 prompt 要求输出单行 JSON", () => {
    const p = buildPlanPrompt("写文案");
    expect(p).toContain("拆解为 2~5 个有序执行节点");
    expect(p).toContain('"steps"');
  });
  it("单步 prompt 含前序产出与当前节点", () => {
    const p = buildStepPrompt({ task: "写文案", stepName: "成稿", previousSummary: "调研：结论A" });
    expect(p).toContain("成稿");
    expect(p).toContain("调研：结论A");
    expect(p).toContain("review");
  });
  it("单步 prompt 注入打回原因（重做）", () => {
    const p = buildStepPrompt({ task: "写文案", stepName: "成稿", feedback: "风格不对，重写" });
    expect(p).toContain("风格不对，重写");
    expect(p).toContain("上一次被打回");
  });
});

describe("createStepRunner（子代理逐步执行 + 人工/自评确认 + 打回重做）", () => {
  it("自动模式（自评）：全节点 pass → completed，回写 result/report/outputs", async () => {
    const h = makeDeps();
    h.setAuto(true);
    h.nextStepResult(stepPass("调研完成", "结论A"));
    h.nextStepResult(stepPass("成稿完成", "正文B"));
    const handle = createStepRunner(makeInput(), h.deps);
    const result = await handle.wait();
    expect(result.status).toBe("completed");
    expect(result.steps).toHaveLength(2);
    expect(result.outputs.map((o) => o.content)).toEqual(["结论A", "正文B"]);
    const finalPatch = h.patches[h.patches.length - 1];
    expect(finalPatch.payload.status).toBe("completed");
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0].status).toBe("completed");
    expect(h.outputs[0].outputs).toHaveLength(2);
  });

  it("人工模式：节点 pending_review → confirmStep 通过 → completed", async () => {
    const h = makeDeps();
    h.nextStepResult(stepPass("调研完成", "结论A"));
    h.nextStepResult(stepPass("成稿完成", "正文B"));
    const handle = createStepRunner(makeInput(), h.deps);
    const waitP = handle.wait();
    await until(() => pendingReviewCount(h, 0) === 1);
    handle.confirmStep(0);
    await until(() => pendingReviewCount(h, 1) === 1);
    handle.confirmStep(1);
    const result = await waitP;
    expect(result.status).toBe("completed");
    expect(result.steps.map((s) => s.status)).toEqual(["done", "done"]);
    expect(result.steps[0].review?.by).toBe("user");
    expect(h.reports[0].status).toBe("completed");
  });

  it("人工打回：必填原因 → 自动重做该节点（注入原因）→ 再次确认通过", async () => {
    const h = makeDeps();
    h.nextStepResult(stepPass("初稿", "初稿内容"));
    h.nextStepResult(stepPass("修正稿", "修正内容"));
    h.nextStepResult(stepPass("成稿", "成稿内容"));
    const handle = createStepRunner(makeInput(), h.deps);
    const waitP = handle.wait();
    await until(() => pendingReviewCount(h, 0) === 1);
    handle.rejectStep(0, "风格不对，重写");
    await until(() => pendingReviewCount(h, 0) === 2);
    handle.confirmStep(0);
    await until(() => pendingReviewCount(h, 1) === 1);
    handle.confirmStep(1);
    const result = await waitP;
    expect(result.status).toBe("completed");
    expect(result.steps[0].retryCount).toBe(1);
    expect(result.steps[0].lastFeedback).toBe("风格不对，重写");
    expect(result.steps[0].review?.by).toBe("user");
    const redoPrompt = (h.deps.runPrompt as jest.Mock).mock.calls[2][0] as string;
    expect(redoPrompt).toContain("风格不对，重写");
  });

  it("打回超限（maxRetries=1）→ 节点 rejected → 任务 failed", async () => {
    const h = makeDeps();
    h.deps.maxRetries = 1;
    h.nextStepResult(stepPass("初稿", "初稿内容"));
    h.nextStepResult(stepPass("二次稿", "二次稿内容"));
    const handle = createStepRunner(makeInput(), h.deps);
    const waitP = handle.wait();
    await until(() => pendingReviewCount(h, 0) === 1);
    handle.rejectStep(0, "重做原因一");
    await until(() => pendingReviewCount(h, 0) === 2);
    handle.rejectStep(0, "重做原因二");
    const result = await waitP;
    expect(result.status).toBe("failed");
    expect(result.error).toContain("重做原因二");
    expect(h.patches[h.patches.length - 1].payload.status).toBe("failed");
    expect((h.deps.runPrompt as jest.Mock).mock.calls).toHaveLength(3);
  });

  it("自动模式：自评 rework → 自动重做，二次 pass → 完成", async () => {
    const h = makeDeps();
    h.setAuto(true);
    h.nextStepResult(
      JSON.stringify({
        summary: "初稿",
        outputs: [{ type: "text", content: "初稿内容" }],
        review: { verdict: "rework", reason: "不够好" },
      }),
    );
    h.nextStepResult(stepPass("修正稿", "修正内容"));
    h.nextStepResult(stepPass("成稿", "成稿内容"));
    const handle = createStepRunner(makeInput(), h.deps);
    const result = await handle.wait();
    expect(result.status).toBe("completed");
    expect(result.steps[0].retryCount).toBe(1);
    expect(result.steps[0].lastFeedback).toBe("不够好");
  });

  it("规划失败 → failed（错误信息透出）", async () => {
    const h = makeDeps();
    h.setPlan("我不理解这个任务");
    const handle = createStepRunner(makeInput(), h.deps);
    const result = await handle.wait();
    expect(result.status).toBe("failed");
    expect(result.error).toContain("节点清单");
  });

  it("单步执行异常（Hermes 未安装）→ 节点 rejected → failed", async () => {
    const h = makeDeps();
    const plan = JSON.stringify({ steps: [{ name: "调研" }] });
    h.deps.runPrompt = jest.fn(async (prompt: string) =>
      prompt.includes("拆解为")
        ? { stdout: plan }
        : { stdout: "", error: "Hermes 运行时未安装或未配置" },
    );
    const handle = createStepRunner(makeInput(), h.deps);
    const result = await handle.wait();
    expect(result.status).toBe("failed");
    expect(result.error).toContain("Hermes 运行时未安装或未配置");
  });
});

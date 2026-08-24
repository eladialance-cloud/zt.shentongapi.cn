/** Hermes 编排结果解析：CLI stdout → OrchestrateResult（纯函数，可单测） */

export interface HermesOutput {
  type: string;
  url?: string;
  content?: string;
}

export interface HermesStep {
  name: string;
  status: "done" | "running" | "pending";
  /** 执行成员（团队驱动执行）：team_members.id 与角色名；缺省表示 Hermes 原生子代理 */
  assigneeMemberId?: number;
  assigneeName?: string;
  outputs?: HermesOutput[];
  agentRole?: string;
  review?: { verdict: "pass" | "rework"; reason?: string; by?: "hermes" | "user"; at?: string };
  /** 执行者原始自评（仅展示；通过决定权归 Hermes 评审） */
  selfReview?: { verdict: "pass" | "rework"; reason?: string };
  retryCount?: number;
  lastFeedback?: string;
  /** 节点执行时 Hermes 的思考过程（JSON 前文本） */
  reasoning?: string;
  /** 逐步执行原始状态（pending/running/pending_review/done/rejected），顶层 status 为其收敛值 */
  rawStatus?: string;
}

export interface OrchestrateResult {
  status: "completed" | "failed";
  summary: string;
  steps: HermesStep[];
  outputs: HermesOutput[];
  error: string | null;
  durationMs: number;
  /** 规划阶段 Hermes 的思考过程（JSON 前文本） */
  planReasoning?: string;
}

function normalizeOutput(raw: unknown): HermesOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = typeof r.type === "string" ? r.type : "text";
  const url = typeof r.url === "string" ? r.url : undefined;
  const content = typeof r.content === "string" ? r.content : undefined;
  if (!url && !content) return null;
  return { type, ...(url ? { url } : {}), ...(content ? { content } : {}) };
}

function normalizeStep(raw: unknown): HermesStep | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) return null;
  const status = r.status === "running" || r.status === "pending" ? r.status : "done";
  const outputs = Array.isArray(r.outputs)
    ? r.outputs.map(normalizeOutput).filter((o): o is HermesOutput => o !== null)
    : undefined;
  const assigneeMemberId = typeof r.assigneeMemberId === "number" ? r.assigneeMemberId : undefined;
  const assigneeName = typeof r.assigneeName === "string" ? r.assigneeName : undefined;
  const reasoning = typeof r.reasoning === "string" && r.reasoning.trim() ? r.reasoning : undefined;
  return {
    name,
    status,
    ...(assigneeMemberId !== undefined ? { assigneeMemberId } : {}),
    ...(assigneeName ? { assigneeName } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(outputs && outputs.length > 0 ? { outputs } : {}),
  };
}

function extractJson(text: string): string | null {
  return parseLastJson(text)?.text ?? null;
}

/** 扫描文本中的 JSON 候选块：先取所有代码围栏内容，再按花括号配对扫描全部 {…} 片段（保持原文顺序） */
function scanJsonCandidates(text: string): string[] {
  const out: string[] = [];
  const t = (text || "");
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/g;
  let fm: RegExpExecArray | null;
  while ((fm = fenceRe.exec(t)) !== null) out.push(fm[1].trim());
  let i = 0;
  while (i < t.length) {
    const ch0 = t[i];
    if (ch0 !== "{" && ch0 !== "[") {
      i++;
      continue;
    }
    const open = ch0;
    const close = ch0 === "{" ? "}" : "]";
    let depth = 0;
    let inStr = false;
    let esc = false;
    let j = i;
    for (; j < t.length; j++) {
      const ch = t[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') {
        inStr = true;
        continue;
      }
      if (ch === open) {
        depth++;
        continue;
      }
      if (ch === close) {
        depth--;
        if (depth === 0) {
          out.push(t.slice(i, j + 1));
          i = j + 1;
          break;
        }
      }
    }
    i++;
  }
  return out;
}

/** 取最后一个可解析的 JSON 对象：CLI 输出可能含日志/工具调用等事件流，最终答案通常在末尾 */
export function parseLastJson(text: string): { text: string; start: number } | null {
  const candidates = scanJsonCandidates(text || "");
  for (let k = candidates.length - 1; k >= 0; k--) {
    const c = candidates[k];
    try {
      JSON.parse(c);
    } catch {
      continue;
    }
    return { text: c, start: (text || "").indexOf(c) };
  }
  return null;
}

/** 提取 JSON 之前的思考文本（去空行、截断）；无 JSON 返回空串 */
export function extractReasoning(text: string, maxLen = 3000): string {
  const t = (text || "").trim();
  if (!t) return "";
  const found = parseLastJson(t);
  const pre = found && found.start > 0 ? t.slice(0, found.start) : "";
  // 去掉思考文本末尾的代码围栏起始符（fenced JSON 场景）
  const preCleaned = pre.replace(/```(?:json)?\s*$/i, "");
  const lines = preCleaned.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const out = lines.join("\n");
  return out.length > maxLen ? out.slice(0, maxLen) : out;
}

export function parseHermesResult(stdout: string, durationMs: number): OrchestrateResult {
  const text = (stdout || "").trim();
  const fallback: OrchestrateResult = {
    status: "completed",
    summary: text || "(Hermes 无输出)",
    steps: [],
    outputs: [],
    error: null,
    durationMs,
  };
  const jsonText = extractJson(text);
  if (!jsonText) return fallback;
  try {
    const data = JSON.parse(jsonText);
    if (!data || typeof data !== "object") return fallback;
    const d = data as Record<string, unknown>;
    const summary = typeof d.summary === "string" ? d.summary : fallback.summary;
    const planReasoning = extractReasoning(text, 3000);
    return {
      status: d.status === "failed" ? "failed" : "completed",
      summary,
      steps: Array.isArray(d.steps) ? d.steps.map(normalizeStep).filter((s): s is HermesStep => s !== null) : [],
      outputs: Array.isArray(d.outputs) ? d.outputs.map(normalizeOutput).filter((o): o is HermesOutput => o !== null) : [],
      error: typeof d.error === "string" ? d.error : null,
      durationMs,
      ...(planReasoning ? { planReasoning } : {}),
    };
  } catch {
    return fallback;
  }
}
/** 单步执行结果（子代理完成一个节点） */
export interface StepRunResult {
  summary?: string;
  outputs?: HermesOutput[];
  review?: { verdict: "pass" | "rework"; reason?: string };
  error?: string;
  /** 单步思考过程（JSON 前文本） */
  reasoning?: string;
}

/**
 * 解析单步执行 stdout：JSON 形如
 * { "summary": "...", "outputs": [{type,url,content}], "review": { verdict: "pass"|"rework", reason } }
 * 失败降级：仅 summary=原文，verdict 缺失时按有产出 pass / 无产出 rework 兜底。
 */
export function parseStepResult(stdout: string): StepRunResult {
  const text = (stdout || "").trim();
  const fallback: StepRunResult = { summary: text || "(Hermes 无输出)" };
  const found = parseLastJson(text);
  if (!found) {
    // 非 JSON：把全文按文本产出收录（避免“无产出”误判重做；Hermes 独立评审仍会把关质量）
    if (!text) return fallback;
    return {
      summary: (text.split("\n")[0] ?? "").trim().slice(0, 200) || fallback.summary,
      outputs: [{ type: "text", content: text }],
      review: { verdict: "pass", reason: "输出非 JSON，按文本产出收录（由 Hermes 评审把关）" },
    };
  }
  try {
    const data = JSON.parse(found.text) as Record<string, unknown>;
    if (!data || typeof data !== "object") return fallback;
    const summary = typeof data.summary === "string" && data.summary.trim() ? data.summary.trim() : fallback.summary;
    let outputs = Array.isArray(data.outputs)
      ? data.outputs.map(normalizeOutput).filter((o): o is HermesOutput => o !== null)
      : [];
    // JSON 只有说明没有产出 → 以 summary 作为文本产出，避免“空产出”被误判重做
    if (outputs.length === 0 && summary && summary !== fallback.summary) {
      outputs = [{ type: "text", content: summary }];
    }
    const rawReview = data.review as Record<string, unknown> | undefined;
    const verdict = rawReview?.verdict === "rework" ? "rework" : "pass";
    const reason = typeof rawReview?.reason === "string" ? rawReview.reason : undefined;
    const reasoning = extractReasoning(text, 1500);
    return {
      summary,
      ...(outputs.length > 0 ? { outputs } : {}),
      review: { verdict, ...(reason ? { reason } : {}) },
      ...(reasoning ? { reasoning } : {}),
    };
  } catch {
    return fallback;
  }
}

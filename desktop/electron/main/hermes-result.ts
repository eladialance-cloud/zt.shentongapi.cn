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
}

export interface OrchestrateResult {
  status: "completed" | "failed";
  summary: string;
  steps: HermesStep[];
  outputs: HermesOutput[];
  error: string | null;
  durationMs: number;
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
  return {
    name,
    status,
    ...(assigneeMemberId !== undefined ? { assigneeMemberId } : {}),
    ...(assigneeName ? { assigneeName } : {}),
    ...(outputs && outputs.length > 0 ? { outputs } : {}),
  };
}

function extractJson(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
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
    return {
      status: d.status === "failed" ? "failed" : "completed",
      summary,
      steps: Array.isArray(d.steps) ? d.steps.map(normalizeStep).filter((s): s is HermesStep => s !== null) : [],
      outputs: Array.isArray(d.outputs) ? d.outputs.map(normalizeOutput).filter((o): o is HermesOutput => o !== null) : [],
      error: typeof d.error === "string" ? d.error : null,
      durationMs,
    };
  } catch {
    return fallback;
  }
}
// Hermes 对话推理强度（纯数据 + 归一化；对齐上游 useReasoningEffort 的取值）
export type ReasoningEffort = "auto" | "minimal" | "low" | "medium" | "high" | "xhigh"

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "auto"

export interface ReasoningEffortOption {
  value: ReasoningEffort
  label: string
  description: string
}

export const REASONING_EFFORTS: ReasoningEffortOption[] = [
  { value: "auto", label: "自动", description: "由模型/网关自动决定" },
  { value: "minimal", label: "极简", description: "最快，低推理开销" },
  { value: "low", label: "低", description: "少推理，响应更快" },
  { value: "medium", label: "中", description: "平衡速度与质量" },
  { value: "high", label: "高", description: "更深入推理" },
  { value: "xhigh", label: "极高", description: "最深入推理（较慢）" },
]

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return value === "auto" || value === "minimal" || value === "low" || value === "medium" || value === "high" || value === "xhigh"
    ? value
    : DEFAULT_REASONING_EFFORT
}

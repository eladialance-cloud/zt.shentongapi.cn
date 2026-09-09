// Hermes 对话页上下文窗口推断（纯函数，对齐上游 contextWindows.ts；用于上下文条展示）
/** 模型 id 子串 → 上下文窗口（token）启发式映射，首个命中生效 */
const CONTEXT_WINDOWS: Array<[RegExp, number]> = [
  [/llama-3\.[13]/i, 131072],
  [/llama-4/i, 131072],
  [/gpt-oss/i, 131072],
  [/mixtral/i, 32768],
  [/gpt-4o|gpt-4\.1|gpt-4-turbo|^o[1-4]|gpt-5/i, 128000],
  [/gpt-3\.5/i, 16385],
  [/claude-fable/i, 1000000],
  [/claude/i, 200000],
  [/gemini-1\.5|gemini-2|gemini-3/i, 1048576],
  [/deepseek/i, 131072],
  [/agnes/i, 262144],
  [/kimi|moonshot/i, 262144],
  [/qwen/i, 32768],
  [/mistral/i, 32768],
]

/** 未命中已知模型族时的默认上下文窗口 */
export const DEFAULT_CONTEXT_WINDOW = 131072

export function contextWindowForModel(model?: string | null): number {
  if (!model) return DEFAULT_CONTEXT_WINDOW
  for (const [pattern, size] of CONTEXT_WINDOWS) {
    if (pattern.test(model)) return size
  }
  return DEFAULT_CONTEXT_WINDOW
}

/** 数字缩写：1.5M / 128k / 9500 */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    const val = (n / 1_000_000).toFixed(1)
    return `${val.endsWith(".0") ? val.slice(0, -2) : val}M`
  }
  if (n >= 1000) {
    const val = (n / 1000).toFixed(1)
    return `${val.endsWith(".0") ? val.slice(0, -2) : val}k`
  }
  return String(Math.round(n))
}

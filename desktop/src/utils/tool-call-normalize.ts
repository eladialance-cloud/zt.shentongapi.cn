// 工具调用记录容错归一化
//
// 历史消息里的 toolCalls 由多代客户端写库，形状并不统一（DB 里是 JSON 列，
// 只有写入侧自律，没有 schema 约束）：
//   1. 深瞳自有形状   { id, name, input, output, status }
//   2. OpenAI 工具调用 { id, type: 'function', function: { name, arguments } }
//   3. 旧别名形状     { id, toolName | tool_name | label | tool, args, result }
//   4. 双编码 JSON 串 '[{"id":"1","name":"x"}]'（整列被当成字符串返回）
// 读取侧原先只认第 1 种：遇到 2/3/4 时 name 变 undefined，渲染层
// humanizeToolName(msg.name) 会抛
// `Cannot read properties of undefined (reading 'includes')`，整页白屏。
// 这里把各种形状收敛成第 1 种，并保证 name 永远是非空字符串。

import type { ToolCallInfo } from '@/types/chat'

/** 归一化后的工具调用（渲染层唯一认得的形状） */
export interface NormalizedToolCall {
  id: string
  name: string
  input: unknown
  output: unknown
  status?: ToolCallInfo['status']
}

/** 工具名字段的已知别名（含 OpenAI 的 function.name） */
const NAME_KEYS = [
  'name',
  'toolName',
  'tool_name',
  'label',
  'tool',
  'functionName',
  'function_name',
] as const

/** 调用 id 的已知别名 */
const ID_KEYS = [
  'id',
  'callId',
  'call_id',
  'toolCallId',
  'tool_call_id',
  'functionCallId',
] as const

/** 只带这些字段的对象仍按工具调用处理（避免丢掉真实调用记录） */
const SHAPE_HINTS = [
  ...NAME_KEYS,
  'input',
  'args',
  'arguments',
  'output',
  'result',
  'callId',
  'call_id',
  'tool_call_id',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function firstText(source: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

/** 工具调用的任意字段 → 可展示文本（对象序列化，null/undefined 给空串） */
export function toolCallText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return String(value)
  }
}

function normalizeStatus(raw: Record<string, unknown>): ToolCallInfo['status'] | undefined {
  const text = firstText(raw, ['status', 'state']).toLowerCase()
  if (!text) return undefined
  if (/fail|error|cancel/.test(text)) return 'failed'
  if (/run|pending|start|progress|queue/.test(text)) return 'running'
  return 'success'
}

/** 单条工具调用 → 统一形状；不是工具调用对象时返回 null */
export function normalizeToolCall(raw: unknown): NormalizedToolCall | null {
  if (!isRecord(raw)) return null
  const fn = isRecord(raw.function) ? raw.function : null
  const looksLikeCall = !!fn || SHAPE_HINTS.some((key) => key in raw)
  if (!looksLikeCall) return null

  const name = firstText(raw, NAME_KEYS) || (fn ? firstText(fn, NAME_KEYS) : '')
  const id =
    firstText(raw, ID_KEYS) || (fn ? firstText(fn, ID_KEYS) : '') || name || 'tool'
  const input =
    raw.input ?? raw.args ?? raw.arguments ?? (fn ? fn.arguments : undefined) ?? {}
  const output = raw.output ?? raw.result ?? (fn ? fn.result : undefined)

  return {
    id,
    // 名字缺失也要给可渲染的兜底，绝不让 undefined 流到渲染层
    name: name || 'tool',
    input,
    output,
    status: normalizeStatus(raw),
  }
}

function asList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return []
    try {
      return asList(JSON.parse(text))
    } catch {
      return []
    }
  }
  if (isRecord(raw)) return [raw]
  return []
}

/** 任意 toolCalls 载荷 → 统一形状数组（容忍 JSON 串、单对象、null、脏元素） */
export function normalizeToolCalls(raw: unknown): NormalizedToolCall[] {
  const out: NormalizedToolCall[] = []
  for (const item of asList(raw)) {
    const normalized = normalizeToolCall(item)
    if (normalized) out.push(normalized)
  }
  return out
}

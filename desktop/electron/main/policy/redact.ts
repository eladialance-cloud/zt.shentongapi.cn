/**
 * redact —— 日志/上报脱敏策略（安全审计 S-75 / S-30 / S-79）
 *
 * 目标：日志要能排查问题，但绝不能把凭据写进 userData/logs/main.log ——
 * 该文件常被用户导出给客服、被同步盘/备份带走，是凭据外泄的常见路径。
 *
 * 两条互补的策略：
 *  1. redactText：按**形态**识别（JWT / sk- / cli_ / Bearer / key=value），用于字符串；
 *  2. redactValue：按**键名**识别（token / apiKey / password ...）并递归结构，用于对象。
 *
 * 设计原则：宁可多抹一点，也不要漏；同时避免误伤正常文本（中文、端口号、路径、任务号），
 * 否则日志会变成一堆 ***，反而没人看。
 *
 * 已知局限：无法识别「无固定形态、键名也不敏感」的自由文本里的机密（例如把 Key 直接塞进
 * 一句自然语言）。这类只能靠上游不要拼接凭据。
 */

const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{4,}\b/g
const SK_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}/g
const CLI_PATTERN = /\bcli_[A-Za-z0-9]{8,}/g
/** Bearer / Basic 之后的凭据部分 */
const BEARER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{8,}=*/gi
/** key=value 或 key: value 形态的常见敏感字段（键名大小写不敏感，可带引号） */
const KV_PATTERN =
  /(["']?(?:pass(?:word|wd)?|pwd|secret|token|api[_-]?key|apikey|authorization|credential|private[_-]?key|access[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?id|signature|cookie)["']?\s*[:=]\s*["']?)([^"'\s,;}\]]{6,})/gi
const REDACTED = '***'

/** 对字符串做形态脱敏；非字符串原样返回（方便直接接 console 参数） */
export function redactText(input: unknown): unknown {
  if (typeof input !== 'string' || !input) return input
  return input
    .replace(JWT_PATTERN, '[JWT]')
    .replace(SK_PATTERN, '[KEY]')
    .replace(CLI_PATTERN, '[KEY]')
    .replace(BEARER_PATTERN, '$1 ' + REDACTED)
    .replace(KV_PATTERN, '$1' + REDACTED)
}

/** 键名是否敏感（此类键的值一律替换为 ***，不尝试识别形态） */
const SENSITIVE_KEY_PATTERN =
  /(pass(word|wd)?|pwd|secret|token|api[_-]?key|apikey|authorization|credential|private[_-]?key|access[_-]?key|session[_-]?id|signature|cookie)/i

export const DEFAULT_REDACT_DEPTH = 6

/**
 * 递归脱敏：敏感键置 ***，字符串过 redactText，循环引用记 [Circular]，超深记 [DepthLimit]。
 * 绝不抛错 —— 它跑在日志路径上，脱敏本身不能成为新的崩溃点。
 */
export function redactValue(value: unknown, depth: number = DEFAULT_REDACT_DEPTH): unknown {
  try {
    return redactInner(value, depth, new Set<unknown>())
  } catch {
    return '[Unserializable]'
  }
}

function redactInner(value: unknown, depth: number, seen: Set<unknown>): unknown {
  if (value === null || value === undefined) return value
  const type = typeof value
  if (type === 'string') return redactText(value)
  if (type === 'number' || type === 'boolean' || type === 'bigint') return value
  if (type === 'function') return '[Function]'
  if (type === 'symbol') return String(value)

  // Error 实例的 message/stack 是非枚举属性，直接当对象处理会得到 {}，排查时会丢信息
  if (value instanceof Error) {
    return redactText(value.stack || (value.name + ': ' + value.message))
  }
  if (value instanceof Date) return value.toISOString()

  if (depth <= 0) return '[DepthLimit]'
  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  try {
    if (Array.isArray(value)) return value.map((item) => redactInner(item, depth - 1, seen))
    if (value instanceof Map) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of value) out[String(k)] = redactInner(v, depth - 1, seen)
      return out
    }
    if (value instanceof Set) {
      return Array.from(value, (item) => redactInner(item, depth - 1, seen))
    }

    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED
        continue
      }
      let child: unknown
      try {
        child = (value as Record<string, unknown>)[key]
      } catch {
        // getter 抛错：不要让脱敏把日志搞崩
        out[key] = '[Unreadable]'
        continue
      }
      out[key] = redactInner(child, depth - 1, seen)
    }
    return out
  } finally {
    // 允许同一对象在兄弟分支上重复出现（只有真正的环才标记 Circular）
    seen.delete(value)
  }
}

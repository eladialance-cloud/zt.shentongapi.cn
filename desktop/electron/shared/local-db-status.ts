/**
 * 本地库降级状态（安全审计 S-45）。
 *
 * 背景：S-45 决策（方案 A，2026-09-13 定稿）下本产品不做本地加密库，package.json 不含 @journeyapps/sqlcipher，
 * local-db 的 require 失败后进入 handleDegradation → 所有查询抛 DBDegradedException → 渲染层回退云端 API。
 * 原实现只把一行 error 留在主进程 console 里，渲染层从未读取 isDegraded()/db:degraded，
 * 于是「本地加密存储」在用户视角是**静默失效**的（产品文案与实际不一致）。
 *
 * 本模块提供纯判定与文案（零 electron / 零 node 依赖）：
 *   - LocalDbStatus：结构化状态（是否降级 / 原因码 / 详情 / 时间）；
 *   - normalizeDegradedCode / sanitizeDegradedReason：入参归一化 + 脱敏截断；
 *   - describeLocalDbDegraded / localDbDegradedNotice：渲染层提示文案（判定与接线分离）。
 */

export const LOCAL_DB_DEGRADED_CODES = [
  'MODULE_UNAVAILABLE',
  'INVALID_KEY',
  'KEY_MISMATCH',
  'OPEN_FAILED',
  'SCHEMA_FAILED',
  'UNKNOWN',
] as const

export type LocalDbDegradedCode = (typeof LOCAL_DB_DEGRADED_CODES)[number]

/** 主进程 → 渲染层的本地库降级状态 */
export interface LocalDbStatus {
  /** 是否处于降级模式（本地读写一律回退云端 API，数据不落本机） */
  degraded: boolean
  /** 是否已成功打开本地加密库 */
  initialized: boolean
  /** 本构建是否包含 sqlcipher 原生模块（S-45 起打包产物恒为 false，字段保留以兼容既有渲染层契约） */
  moduleAvailable: boolean
  /** 降级原因码（未降级为 null） */
  code: LocalDbDegradedCode | null
  /** 降级原因详情（已脱敏截断，不含密钥；未降级为 null） */
  reason: string | null
  /** 首次降级时间（ISO 字符串，未降级为 null） */
  degradedAt: string | null
}

/** 渲染层拿不到主进程状态时的兜底值（渲染层不据此提示） */
export const LOCAL_DB_STATUS_UNKNOWN: LocalDbStatus = Object.freeze({
  degraded: false,
  initialized: false,
  moduleAvailable: false,
  code: null,
  reason: null,
  degradedAt: null,
})

/** 原因码归一化：不认识的值一律归为 UNKNOWN（绝不把任意字符串透传给渲染层） */
export function normalizeDegradedCode(raw: unknown): LocalDbDegradedCode {
  const text = typeof raw === 'string' ? raw.trim() : ''
  const hit = (LOCAL_DB_DEGRADED_CODES as readonly string[]).includes(text)
  return hit ? (text as LocalDbDegradedCode) : 'UNKNOWN'
}

/** 密钥类密文片段（32 位以上 hex）：错误信息里若回显 SQL 会带出密钥，一律抹掉 */
const HEX_RUN_RE = /[0-9a-fA-F]{32,}/g

/** 原因详情脱敏 + 截断；空内容返回 null */
export function sanitizeDegradedReason(raw: unknown, maxChars = 200): string | null {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : ''
  const trimmed = text.trim().replace(HEX_RUN_RE, '[redacted]')
  if (!trimmed) return null
  const limit = Number.isFinite(maxChars) && maxChars > 0 ? Math.floor(maxChars) : 200
  return trimmed.slice(0, limit)
}

/** 组装状态：入参一律当作不可信（IPC / 单测双用） */
export function buildLocalDbStatus(input: {
  degraded?: unknown
  initialized?: unknown
  moduleAvailable?: unknown
  code?: unknown
  reason?: unknown
  degradedAt?: unknown
}): LocalDbStatus {
  const degraded = input?.degraded === true
  const rawAt = typeof input?.degradedAt === 'string' ? input.degradedAt.trim() : ''
  const at = rawAt && !Number.isNaN(Date.parse(rawAt)) ? new Date(rawAt).toISOString() : null
  return {
    degraded,
    initialized: input?.initialized === true,
    moduleAvailable: input?.moduleAvailable === true,
    code: degraded ? normalizeDegradedCode(input?.code) : null,
    reason: degraded ? sanitizeDegradedReason(input?.reason) : null,
    degradedAt: degraded ? at : null,
  }
}

/** 用户可读说明（一句话讲清「发生了什么 + 数据在哪」） */
export function describeLocalDbDegraded(code: LocalDbDegradedCode | null): string {
  switch (code) {
    case 'MODULE_UNAVAILABLE':
      return '本机未包含本地加密数据库组件：数据不会存到本机，功能已自动改用云端接口。'
    case 'INVALID_KEY':
      return '本地数据库密钥格式不合法：已停用本地存储，功能已自动改用云端接口。'
    case 'KEY_MISMATCH':
      return '本地数据库密钥校验失败（换过账号或密钥）：已停用本地存储，功能已自动改用云端接口。'
    case 'OPEN_FAILED':
      return '本地数据库无法打开：已停用本地存储，功能已自动改用云端接口。'
    case 'SCHEMA_FAILED':
      return '本地数据库结构初始化失败：已停用本地存储，功能已自动改用云端接口。'
    default:
      return '本地加密数据库不可用：已停用本地存储，功能已自动改用云端接口。'
  }
}

/**
 * 渲染层唯一的提示判定入口：需要提示时返回文案，否则返回 null。
 * 入参按不可信处理（IPC 返回值 / 老版本 preload 缺字段 / 非对象）。
 */
export function localDbDegradedNotice(status: unknown): string | null {
  if (!status || typeof status !== 'object') return null
  const degraded = (status as { degraded?: unknown }).degraded === true
  if (!degraded) return null
  const raw = (status as { code?: unknown }).code
  return describeLocalDbDegraded(raw == null ? null : normalizeDegradedCode(raw))
}

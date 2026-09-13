/**
 * draft-store-policy —— 渲染层持久化的「能写什么 / 写多大 / 落到哪」策略（安全审计 S-53）。
 *
 * 背景：渲染层原本把两类数据明文写进 localStorage：
 *   1. 流式草稿 chat-stream:draft（每 6s 一次全量覆盖，见 src/store/chat-stream.ts）；
 *   2. refreshToken（zustand persist 的 auth-storage，见 src/store/auth.ts）。
 * localStorage 与渲染层同源，任意被注入的脚本都能读走，而 refreshToken 是长期凭据。
 *
 * 因此改为「渲染层 → IPC → 主进程落 userData」，本模块负责其中的纯判定部分：
 *   - namespace 白名单（枚举，不接受任意值）；
 *   - key 白名单（正则，禁止路径分隔符与 .. 穿越）；
 *   - 载荷体积上限（按 UTF-8 字节）；
 *   - 落盘路径限定（拼接后必须仍在 root 内）。
 *
 * 命名空间分级（由调用方 services/renderer-store 落实）：
 *   - chat-draft（非凭据）：允许在无加密能力时降级明文，保证崩溃恢复可用；
 *   - auth-token（凭据）：必须加密，无法加密时**拒绝写入**，绝不落明文。
 *
 * 纯函数、零 electron 依赖，路径计算用 node:path（可在 jest 直测）。
 */
import { join, resolve, sep } from 'node:path'

export const DRAFT_STORE_NAMESPACES = ['chat-draft', 'auth-token'] as const
export type DraftStoreNamespace = (typeof DRAFT_STORE_NAMESPACES)[number]

export type DraftStoreDenyReason =
  | 'EMPTY'
  | 'INVALID_NAMESPACE'
  | 'INVALID_KEY'
  | 'SERIALIZE'
  | 'TOO_LARGE'
  | 'IO'

/** 键名白名单：字母数字与 . _ : -，1~128 字符，且不得出现 .. （防穿越） */
export const DRAFT_KEY_RE = /^(?!.*\.\.)[A-Za-z0-9_.:-]{1,128}$/

/** 单个条目的体积上限（草稿全文；正常远小于此） */
export const MAX_DRAFT_BYTES = 512 * 1024

/** 凭据命名空间：落盘必须加密 */
export function isSecretNamespace(namespace: unknown): boolean {
  return namespace === 'auth-token'
}

export function evaluateDraftNamespace(
  raw: unknown,
): { ok: true; namespace: DraftStoreNamespace } | { ok: false; reason: 'INVALID_NAMESPACE' } {
  if (typeof raw !== 'string') return { ok: false, reason: 'INVALID_NAMESPACE' }
  const ns = raw.trim()
  const hit = (DRAFT_STORE_NAMESPACES as readonly string[]).includes(ns)
  return hit ? { ok: true, namespace: ns as DraftStoreNamespace } : { ok: false, reason: 'INVALID_NAMESPACE' }
}

export function evaluateDraftKey(raw: unknown): { ok: true; key: string } | { ok: false; reason: 'INVALID_KEY' } {
  if (typeof raw !== 'string') return { ok: false, reason: 'INVALID_KEY' }
  const key = raw.trim()
  if (!DRAFT_KEY_RE.test(key)) return { ok: false, reason: 'INVALID_KEY' }
  return { ok: true, key }
}

/** 载荷裁决：序列化成功且不超上限；返回可直接落盘的 JSON 文本 */
export function evaluateDraftPayload(
  value: unknown,
  maxBytes: number = MAX_DRAFT_BYTES,
): { ok: true; json: string } | { ok: false; reason: 'SERIALIZE' | 'TOO_LARGE' } {
  if (value === undefined) return { ok: false, reason: 'SERIALIZE' }
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    // BigInt / 循环引用 / toJSON 抛错
    return { ok: false, reason: 'SERIALIZE' }
  }
  if (typeof json !== 'string') return { ok: false, reason: 'SERIALIZE' }
  const limit = Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : MAX_DRAFT_BYTES
  if (Buffer.byteLength(json, 'utf8') > limit) return { ok: false, reason: 'TOO_LARGE' }
  return { ok: true, json }
}

/**
 * 计算落盘路径：<root>/<namespace>/<key>.json。
 * 命名空间 / 键非法，或拼接结果逃出 root，一律返回 null（调用方必须放弃写入）。
 */
export function draftFilePath(root: unknown, namespace: unknown, key: unknown): string | null {
  if (typeof root !== 'string' || !root.trim()) return null
  const ns = evaluateDraftNamespace(namespace)
  if (!ns.ok) return null
  const k = evaluateDraftKey(key)
  if (!k.ok) return null
  const base = resolve(root)
  const full = resolve(join(base, ns.namespace, k.key + '.json'))
  if (!full.startsWith(base + sep)) return null
  return full
}

/** 拒绝原因 → 用户可读文案 */
export function describeDraftStoreDeny(reason: DraftStoreDenyReason): string {
  switch (reason) {
    case 'EMPTY':
      return '待存储内容为空'
    case 'INVALID_NAMESPACE':
      return '存储命名空间不在白名单内'
    case 'INVALID_KEY':
      return '存储键名非法（仅允许字母数字与 . _ : -，且不得包含 ..）'
    case 'SERIALIZE':
      return '内容无法序列化为 JSON'
    case 'TOO_LARGE':
      return '内容超过体积上限（512KB）'
    case 'IO':
      return '本地读写失败'
    default:
      return '本地存储被安全策略拒绝'
  }
}

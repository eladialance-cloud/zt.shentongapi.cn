/**
 * renderer-store —— 渲染层持久化的主进程落盘层（安全审计 S-53）。
 *
 * 为什么要有这层：渲染层原本直接把草稿与 refreshToken 写进 localStorage，
 * 与渲染层同源 → 任意被注入脚本可读；且没有任何路径/体积约束。
 * 现在渲染层只发 IPC，由主进程按 policy/draft-store-policy 的判定落盘：
 *   - 路径限定在 userData/renderer-store/<namespace>/ 下（命名空间 + 键名双白名单）；
 *   - chat-draft（非凭据）：能加密则用 policy/secure-json 的密封信封，无加密能力时降级明文（保草稿恢复）；
 *   - auth-token（凭据）：必须加密；无加密能力时**拒绝写入**，磁盘上不留明文令牌。
 *
 * 依赖注入（canEncrypt / encrypt / decrypt）让「有加密 / 无加密 + 打包 / 无加密 + 开发」
 * 三种组合都可单测；Electron 侧由 index.ts 传 safeStorage 实现。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isEnvelope, openJson, sealJson } from '../policy/secure-json'
import {
  describeDraftStoreDeny,
  draftFilePath,
  evaluateDraftKey,
  evaluateDraftNamespace,
  evaluateDraftPayload,
  isSecretNamespace,
} from '../policy/draft-store-policy'

export interface RendererStoreDeps {
  /** 根目录（Electron 侧为 userData/renderer-store） */
  root: string
  /** 是否具备平台加密能力（safeStorage.isEncryptionAvailable()） */
  canEncrypt: boolean
  /** 是否为打包后的生产环境（app.isPackaged） */
  isPackaged: boolean
  /** 加密实现（safeStorage.encryptString(plain).toString('base64')） */
  encrypt?: (plain: string) => string
  /** 解密实现（safeStorage.decryptString(Buffer.from(sealed,'base64'))） */
  decrypt?: (sealed: string) => string
}

export type RendererStoreSaveResult = { ok: true; sealed: boolean } | { ok: false; error: string }
export type RendererStoreLoadResult<T> = { ok: true; value: T | null } | { ok: false; error: string }
export type RendererStoreClearResult = { ok: boolean; error?: string }

function resolvePath(deps: RendererStoreDeps, namespace: unknown, key: unknown): string | { error: string } {
  const ns = evaluateDraftNamespace(namespace)
  if (!ns.ok) return { error: describeDraftStoreDeny(ns.reason) }
  const k = evaluateDraftKey(key)
  if (!k.ok) return { error: describeDraftStoreDeny(k.reason) }
  const file = draftFilePath(deps?.root, ns.namespace, k.key)
  if (!file) return { error: describeDraftStoreDeny('INVALID_KEY') }
  return file
}

export function saveEntry(
  deps: RendererStoreDeps,
  namespace: unknown,
  key: unknown,
  value: unknown,
): RendererStoreSaveResult {
  const file = resolvePath(deps, namespace, key)
  if (typeof file !== 'string') return { ok: false, error: file.error }

  const payload = evaluateDraftPayload(value)
  if (!payload.ok) return { ok: false, error: describeDraftStoreDeny(payload.reason) }

  const secret = isSecretNamespace(namespace)
  const sealed = sealJson(value, {
    available: Boolean(deps.canEncrypt && deps.encrypt),
    isPackaged: Boolean(deps.isPackaged),
    encrypt: deps.encrypt ?? (() => ''),
  })

  let body: string
  let isSealed = false
  if (sealed.ok) {
    body = JSON.stringify(sealed.envelope)
    isSealed = sealed.envelope.enc
  } else if (secret) {
    // 凭据绝不降级明文：宁可不持久化（用户下次需重新登录），也不把长期令牌写在磁盘上
    return { ok: false, error: '系统未提供安全存储，已拒绝以明文保存凭据' }
  } else {
    // 非凭据（草稿）：无加密能力时降级明文，保证崩溃恢复能力不受影响
    body = payload.json
  }

  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body, { encoding: 'utf-8', mode: 0o600 })
    return { ok: true, sealed: isSealed }
  } catch {
    return { ok: false, error: describeDraftStoreDeny('IO') }
  }
}

export function loadEntry<T = unknown>(
  deps: RendererStoreDeps,
  namespace: unknown,
  key: unknown,
): RendererStoreLoadResult<T> {
  const file = resolvePath(deps, namespace, key)
  if (typeof file !== 'string') return { ok: false, error: file.error }
  if (!existsSync(file)) return { ok: true, value: null }

  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf-8'))
  } catch {
    // 损坏文件按失败处理：不把脏数据当有效状态使用（草稿侧视为「无草稿」）
    return { ok: false, error: describeDraftStoreDeny('IO') }
  }

  if (isEnvelope(parsed)) {
    const opened = openJson<T>(parsed, {
      available: Boolean(deps.canEncrypt && deps.decrypt),
      decrypt: deps.decrypt ?? (() => ''),
    })
    if (!opened.ok) return { ok: false, error: describeDraftStoreDeny('IO') }
    return { ok: true, value: opened.value }
  }

  // 非信封 = 明文体
  if (isSecretNamespace(namespace)) {
    // 凭据目录里出现明文属于异常状态（旧版本残留 / 被人为写入），拒绝读取
    return { ok: false, error: '凭据目录出现明文数据，已拒绝读取' }
  }
  return { ok: true, value: parsed as T }
}

export function clearEntry(deps: RendererStoreDeps, namespace: unknown, key: unknown): RendererStoreClearResult {
  const file = resolvePath(deps, namespace, key)
  if (typeof file !== 'string') return { ok: false, error: file.error }
  try {
    if (existsSync(file)) rmSync(file, { force: true })
    return { ok: true }
  } catch {
    return { ok: false, error: describeDraftStoreDeny('IO') }
  }
}

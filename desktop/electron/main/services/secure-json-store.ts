/**
 * secure-json-store —— 主进程敏感 JSON 落盘/读取（安全审计 S-05 / S-61）
 *
 * 职责：把『要不要加密』的判定（policy/secure-json.ts）与『加密能力从哪来』（Electron safeStorage）接起来。
 *
 * 密钥模型（为什么不是直接用 safeStorage 加密文件内容）：
 * - auth.json 的读者除主进程外，还有 Hermes 运行时里的工具卡脚本（独立 node 进程，拿不到 safeStorage）；
 * - 因此落盘格式是「随机主密钥 + AES-256-GCM」（policy/secret-box.ts），
 *   主密钥仅由 safeStorage 保护后存 .auth-key，另经 ST_AUTH_KEY 注入 Hermes 进程。
 *
 * 不变量：
 * - **绝不落明文**：生产环境加密不可用时拒绝写入（返回 false），而不是降级写明文；
 * - 读取失败一律返回 null（调用方按未登录处理），不返回脏数据、不回退明文分支。
 */

import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { generateSecretKey, isSecretKey, openBox, sealBox } from '../policy/secret-box'
import { isEnvelope, openJson, sealJson, type OpenDeps, type SealDeps } from '../policy/secure-json'

/** 工具卡上下文目录（auth.json / current-accounting.json / knowledge-scope.json 所在处） */
export function authContextDir(): string {
  return join(app.getPath('userData'), 'hermes-chat')
}

/** 云端登录凭据文件 */
export function authFile(): string {
  return join(authContextDir(), 'auth.json')
}

/** 主密钥文件（内容为 safeStorage 密文的 base64） */
export function authKeyFile(): string {
  return join(authContextDir(), '.auth-key')
}

let cachedKey: string | null | undefined

/** 读取（必要时生成）主密钥；safeStorage 不可用或读写失败时返回 null */
export function getOrCreateAuthKey(): string | null {
  if (cachedKey !== undefined) return cachedKey
  cachedKey = loadOrCreateAuthKey()
  return cachedKey
}

function loadOrCreateAuthKey(): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null
  try {
    if (existsSync(authKeyFile())) {
      const stored = readFileSync(authKeyFile(), 'utf8').trim()
      if (stored) {
        const key = safeStorage.decryptString(Buffer.from(stored, 'base64'))
        if (isSecretKey(key)) return key
        console.warn('[secure-store] 主密钥非法，重新生成（旧密文需重新登录）')
      }
    }
  } catch (err) {
    console.warn('[secure-store] 读取主密钥失败，尝试重建:', err)
  }
  try {
    const key = generateSecretKey()
    mkdirSync(dirname(authKeyFile()), { recursive: true })
    writeFileSync(authKeyFile(), safeStorage.encryptString(key).toString('base64'), {
      encoding: 'utf8',
      mode: 0o600,
    })
    return key
  } catch (err) {
    console.error('[secure-store] 生成主密钥失败，敏感数据将不落盘:', err)
    return null
  }
}

/** 测试用：清空密钥缓存（生产代码不应调用） */
export function __resetAuthKeyCacheForTest(): void {
  cachedKey = undefined
}

function sealDeps(): SealDeps {
  const key = getOrCreateAuthKey()
  const available = safeStorage.isEncryptionAvailable() && !!key
  return {
    available,
    isPackaged: app.isPackaged,
    encrypt: (plain: string) => sealBox(plain, key as string),
  }
}

function openDeps(): OpenDeps {
  const key = getOrCreateAuthKey()
  return {
    available: safeStorage.isEncryptionAvailable() && !!key,
    decrypt: (sealed: string) => openBox(sealed, key as string),
  }
}

/**
 * 加密写入 JSON。返回是否写入成功。
 * 生产环境无法加密时**拒绝写入**（返回 false），绝不退化为明文。
 */
export function writeSecureJson(file: string, value: unknown): boolean {
  const sealed = sealJson(value, sealDeps())
  if (!sealed.ok) {
    console.error('[secure-store] 拒绝写入 ' + file + '：' + sealed.reason + '（不落明文）')
    return false
  }
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(sealed.envelope), { encoding: 'utf8', mode: 0o600 })
    return true
  } catch (err) {
    console.error('[secure-store] 写入失败 ' + file + ':', err)
    return false
  }
}

/**
 * 读取敏感 JSON。
 * 支持三种历史格式：密文信封 / 裸 JSON（历史明文，读到后原地升级为密文）/ 'raw:' + 明文（更老格式）。
 * 任何失败返回 null（调用方按未登录处理），绝不返回半成品数据。
 */
export function readSecureJson<T>(file: string): T | null {
  if (!existsSync(file)) return null
  let raw = ''
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    return null
  }
  if (!raw.trim()) return null

  if (raw.startsWith('raw:')) return tryParse<T>(raw.slice(4))

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (isEnvelope(parsed)) {
    const opened = openJson<T>(parsed, openDeps())
    return opened.ok ? opened.value : null
  }

  // 裸 JSON：历史明文。读得到就照常返回，并顺手把磁盘上的明文升级为密文。
  if (writeSecureJson(file, parsed) === false) {
    console.warn('[secure-store] 历史明文未能升级为密文（仍可读）:', file)
  }
  return parsed as T
}

function tryParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

/**
 * 封装一段文本为加密信封（返回信封 JSON 字符串）。
 * 无法加密时返回 null —— 调用方**不得**退化为明文落盘（安全审计 S-61）。
 */
export function sealText(plain: string): string | null {
  const sealed = sealJson({ text: plain }, sealDeps())
  if (!sealed.ok) {
    console.error('[secure-store] 拒绝加密文本：' + sealed.reason + '（不落明文）')
    return null
  }
  return JSON.stringify(sealed.envelope)
}

/**
 * 解开 sealText 的结果。
 * 兼容历史格式：'enc:' + safeStorage 密文 base64（旧 platform-sessions），
 * 'raw:' + 明文（更老版本，仅用于读出后升级为密文）。
 */
export function openText(enc: unknown): string | null {
  if (typeof enc !== 'string' || !enc) return null
  if (enc.startsWith('enc:')) {
    try {
      if (!safeStorage.isEncryptionAvailable()) return null
      return safeStorage.decryptString(Buffer.from(enc.slice(4), 'base64'))
    } catch {
      return null
    }
  }
  if (enc.startsWith('raw:')) return enc.slice(4)
  let parsed: unknown
  try {
    parsed = JSON.parse(enc)
  } catch {
    return null
  }
  const opened = openJson<{ text?: unknown }>(parsed, openDeps())
  if (!opened.ok) return null
  const text = opened.value && typeof opened.value.text === 'string' ? opened.value.text : null
  return text
}

/** 读取云端登录 token（无 token / 未登录 / 解密失败一律返回空串） */
export function readAuthToken(): string {
  const value = readSecureJson<{ token?: unknown }>(authFile())
  return value && typeof value.token === 'string' ? value.token : ''
}

/** 写入云端登录 token；返回是否落盘成功 */
export function writeAuthToken(token: string): boolean {
  if (typeof token !== 'string' || !token) return false
  return writeSecureJson(authFile(), { token })
}

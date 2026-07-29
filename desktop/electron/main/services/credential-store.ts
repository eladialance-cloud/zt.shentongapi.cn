import { safeStorage, app } from 'electron'
import log from 'electron-log'
import * as fs from 'fs'
import * as path from 'path'

/**
 * 使用操作系统原生凭据存储加密/解密字符串
 * Windows: Credential Manager / macOS: Keychain / Linux: libsecret
 *
 * 持久化策略：加密后的 base64 字符串存入 userData/credentials.json
 */

const CREDENTIALS_FILE = path.join(app.getPath('userData'), 'credentials.json')

interface CredentialStore {
  [key: string]: string
}

function loadStore(): CredentialStore {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return {}
    }
    const raw = fs.readFileSync(CREDENTIALS_FILE, 'utf-8')
    return JSON.parse(raw) as CredentialStore
  } catch (err) {
    log.error('[credential-store] loadStore failed', err)
    return {}
  }
}

function saveStore(store: CredentialStore): void {
  try {
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 })
  } catch (err) {
    log.error('[credential-store] saveStore failed', err)
  }
}

/**
 * 加密明文凭据（SafeStorage 不可用时降级返回明文，仅 dev 模式）
 * - 开发环境：允许降级为明文，输出 warn 日志
 * - 生产环境：拒绝存储，返回空字符串，输出 error 日志
 */
export function encryptCredential(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    if (!app.isPackaged) {
      log.warn('[credential-store] SafeStorage 不可用，开发环境降级为明文存储')
      return plain
    }
    log.error('[credential-store] SafeStorage 不可用，生产环境拒绝存储凭据')
    return ''
  }
  return safeStorage.encryptString(plain).toString('base64')
}

/**
 * 解密凭据（解密失败返回空串，SafeStorage 不可用时返回原值）
 * - 开发环境：允许降级返回明文，输出 warn 日志
 * - 生产环境：返回空字符串，输出 error 日志
 */
export function decryptCredential(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    if (!app.isPackaged) {
      log.warn('[credential-store] SafeStorage 不可用，开发环境降级返回原始值')
      return encrypted
    }
    log.error('[credential-store] SafeStorage 不可用，生产环境拒绝解密凭据')
    return ''
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch (err) {
    log.error('[credential-store] 解密失败', err)
    return ''
  }
}

/**
 * 持久化存储加密后的凭据
 */
export function setCredential(key: string, plain: string): void {
  const store = loadStore()
  store[key] = encryptCredential(plain)
  saveStore(store)
}

/**
 * 读取并解密凭据（不存在返回 null）
 */
export function getCredential(key: string): string | null {
  const store = loadStore()
  const encrypted = store[key]
  if (!encrypted) return null
  return decryptCredential(encrypted)
}

/**
 * 删除指定 key 的凭据
 */
export function deleteCredential(key: string): void {
  const store = loadStore()
  if (key in store) {
    delete store[key]
    saveStore(store)
  }
}

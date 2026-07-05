// 本地数据库加密密钥派生
// 使用 PBKDF2 + SHA-256 从用户令牌派生数据库密钥
// 重要：派生出的密钥仅在内存中保持，不落盘；仅盐值可落盘

import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { app } from 'electron'
import { join } from 'node:path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const ITERATIONS = 100000
const KEY_LENGTH = 32 // 32 字节 = 256 位
const SALT_LENGTH = 32 // 32 字节
const SALT_FILE = 'db.salt'

/**
 * 使用 PBKDF2 + SHA-256 从用户令牌派生数据库密钥
 * @param userToken 用户登录令牌
 * @param salt 盐值（hex 字符串）
 * @returns 64 字符 hex 字符串（32 字节密钥）
 */
export function deriveDbKey(userToken: string, salt: string): string {
  if (!userToken) {
    throw new Error('userToken must not be empty')
  }
  if (!salt) {
    throw new Error('salt must not be empty')
  }
  return pbkdf2Sync(userToken, salt, ITERATIONS, KEY_LENGTH, 'sha256').toString('hex')
}

/**
 * 生成随机盐值（32 字节，hex 字符串，64 字符）
 * @returns 64 字符 hex 字符串
 */
export function generateSalt(): string {
  return randomBytes(SALT_LENGTH).toString('hex')
}

/**
 * 验证密钥格式是否合法（64 字符 hex）
 * @param key 待验证的密钥
 */
export function validateKey(key: string): boolean {
  return typeof key === 'string' && /^[0-9a-fA-F]{64}$/.test(key)
}

/**
 * 验证盐值格式是否合法（64 字符 hex）
 * @param salt 待验证的盐值
 */
export function validateSalt(salt: string): boolean {
  return typeof salt === 'string' && /^[0-9a-fA-F]{64}$/.test(salt)
}

/**
 * 获取或创建数据库盐值
 * 盐值存储位置：app.getPath('userData')/db.salt
 * 首次启动时生成并写入，后续读取已有盐值
 * @returns 64 字符 hex 盐值字符串
 */
export function getOrCreateSalt(): string {
  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true })
  }
  const saltPath = join(userDataPath, SALT_FILE)

  if (existsSync(saltPath)) {
    const salt = readFileSync(saltPath, 'utf8').trim()
    if (validateSalt(salt)) {
      return salt
    }
    // 盐值文件存在但格式非法，覆盖重写
    console.warn('[local-db] salt file corrupted, regenerating')
  }

  const salt = generateSalt()
  writeFileSync(saltPath, salt, 'utf8')
  return salt
}

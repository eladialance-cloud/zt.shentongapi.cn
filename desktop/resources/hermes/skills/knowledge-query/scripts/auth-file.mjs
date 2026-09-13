/**
 * 工具卡共享：读取云端登录 token（安全审计 S-05 / S-61）
 *
 * 背景：auth.json 由桌面端主进程加密落盘（AES-256-GCM，格式 `v1.<iv>.<tag>.<ct>`），
 * 主密钥由 Electron safeStorage 保护，并通过 ST_AUTH_KEY 环境变量注入本进程。
 * 本脚本是独立 node 进程，拿不到 safeStorage，因此用注入的密钥解密同一份密文。
 *
 * 兼容：ST_AUTH_KEY 缺失或文件仍是历史明文 JSON 时按明文解析（开发环境 / 首次升级）。
 *
 * 环境变量：
 *   ST_AUTH_FILE - 登录信息文件路径（含 token）
 *   ST_AUTH_KEY  - 主密钥（base64，32 字节），由桌面端注入
 *
 * 注意：本文件在 knowledge-query 与 n8n-run-workflow 两个技能目录下各有一份完全相同的副本
 * （技能目录需自包含，不能跨目录引用）；格式必须与 electron/main/policy/secret-box.ts 保持一致。
 */
import { createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PREFIX = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** `v1.<iv>.<tag>.<ct>` 结构判定 */
export function isSealedBox(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.');
  return parts.length === 4 && parts[0] === PREFIX;
}

/** AES-256-GCM 解密；任何异常都抛出（调用方按「无 token」处理） */
export function openBox(sealed, keyB64) {
  const key = Buffer.from(String(keyB64 || ''), 'base64');
  if (key.length !== 32) throw new Error('密钥长度必须是 32 字节');
  if (!isSealedBox(sealed)) throw new Error('不是合法密文结构');
  const parts = sealed.split('.');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  if (iv.length !== IV_BYTES) throw new Error('IV 长度异常');
  if (tag.length !== TAG_BYTES) throw new Error('认证标签长度异常');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]).toString('utf8');
}

function tokenOf(value) {
  return value && typeof value === 'object' && typeof value.token === 'string' ? value.token : '';
}

/**
 * 读取 token：密文信封（enc:true）用 ST_AUTH_KEY 解密；enc:false 信封与历史裸 JSON 直接解析。
 * 任何失败返回 ''（绝不抛错、绝不返回脏数据）。
 */
export function readAuthToken(env = process.env) {
  const file = env && env.ST_AUTH_FILE;
  if (!file) return '';
  let raw = '';
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '';
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
  const envelope = parsed.v === 1 && typeof parsed.data === 'string';
  if (envelope && parsed.enc === false) {
    try {
      return tokenOf(JSON.parse(parsed.data));
    } catch {
      return '';
    }
  }
  if (envelope && parsed.enc === true) {
    const key = env.ST_AUTH_KEY;
    if (!key) return ''; // 有密文但无密钥：不回退明文、不猜测
    try {
      return tokenOf(JSON.parse(openBox(parsed.data, key)));
    } catch {
      return '';
    }
  }
  return tokenOf(parsed);
}

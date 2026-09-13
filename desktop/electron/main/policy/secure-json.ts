/**
 * secure-json —— 敏感 JSON 落盘策略（安全审计 S-05 部分 / S-61）
 *
 * 问题背景：
 * - 云端 JWT 以明文写在 userData/hermes-chat/auth.json（hermes-chat.ts 直接 JSON.stringify 落盘）；
 * - 平台登录 Cookie 在 safeStorage 不可用时回退为 'raw:' + 明文（platform-login.ts）。
 * 二者都是「本机任意同用户进程可读」的高价值凭据。
 *
 * 设计要点：
 * - 纯函数，加密能力通过 deps 注入 → 三种环境组合（可加密 / 生产不可加密 / 开发不可加密）均可单测；
 * - 生产环境（isPackaged）不可加密时**拒绝写入**，绝不静默落明文；开发环境允许 enc=false 便于调试；
 * - 读取时密文解不开就返回失败，不回退明文、不返回脏数据（避免把损坏数据当有效凭据使用）。
 */

export interface Envelope {
  v: 1;
  /** true = data 为密文；false = data 为明文 JSON（仅开发环境降级） */
  enc: boolean;
  data: string;
}

export interface SealDeps {
  /** 当前平台是否提供加密能力（Electron 为 safeStorage.isEncryptionAvailable()） */
  available: boolean;
  /** 是否为打包后的生产环境（Electron 为 app.isPackaged） */
  isPackaged: boolean;
  encrypt(plain: string): string;
}

export interface OpenDeps {
  available: boolean;
  decrypt(sealed: string): string;
}

export type SealResult = { ok: true; envelope: Envelope } | { ok: false; reason: string };
export type OpenResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function isEnvelope(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return e.v === 1 && typeof e.enc === 'boolean' && typeof e.data === 'string';
}

/**
 * 把对象封装为可落盘信封。
 * 生产环境且不可加密 → { ok: false, reason: 'ENCRYPTION_UNAVAILABLE' }，调用方必须放弃写入。
 */
export function sealJson(value: unknown, deps: SealDeps): SealResult {
  let json: string;
  try {
    json = JSON.stringify(value);
  } catch {
    return { ok: false, reason: 'SERIALIZE' };
  }
  if (typeof json !== 'string') return { ok: false, reason: 'SERIALIZE' };

  if (deps.available) {
    try {
      const encrypted = deps.encrypt(json);
      if (typeof encrypted !== 'string' || encrypted.length === 0) {
        return { ok: false, reason: 'ENCRYPT_FAILED' };
      }
      return { ok: true, envelope: { v: 1, enc: true, data: encrypted } };
    } catch {
      return { ok: false, reason: 'ENCRYPT_FAILED' };
    }
  }

  if (deps.isPackaged) return { ok: false, reason: 'ENCRYPTION_UNAVAILABLE' };
  return { ok: true, envelope: { v: 1, enc: false, data: json } };
}

/**
 * 读取信封。密文但当前不可解密 → 失败（不回退明文）；data 不是合法 JSON → 失败。
 */
export function openJson<T>(envelope: unknown, deps: OpenDeps): OpenResult<T> {
  if (!isEnvelope(envelope)) return { ok: false, reason: 'NOT_ENVELOPE' };
  const env = envelope as Envelope;
  let json: string;
  if (env.enc) {
    if (!deps.available) return { ok: false, reason: 'DECRYPT_UNAVAILABLE' };
    try {
      json = deps.decrypt(env.data);
    } catch {
      return { ok: false, reason: 'DECRYPT_FAILED' };
    }
    if (typeof json !== 'string') return { ok: false, reason: 'DECRYPT_FAILED' };
  } else {
    json = env.data;
  }
  try {
    return { ok: true, value: JSON.parse(json) as T };
  } catch {
    return { ok: false, reason: 'PARSE' };
  }
}

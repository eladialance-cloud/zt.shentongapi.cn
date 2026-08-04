/**
 * 字符串工具
 * 数据合同真源：spec.md - 配置管理
 */
import * as crypto from 'crypto';

export const isEmail = (s: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export const isUsername = (s: string): boolean =>
  /^[a-zA-Z0-9_]{3,32}$/.test(s);

/** @deprecated 使用 generateSecureToken() 替代，本函数基于 Math.random 不安全 */
export const generateRandomString = (length = 32): string => {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/** 生成加密安全的随机十六进制令牌（crypto.randomBytes） */
export const generateSecureToken = (byteLength = 32): string => {
  return crypto.randomBytes(byteLength).toString('hex');
};

export const maskEmail = (email: string): string => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};
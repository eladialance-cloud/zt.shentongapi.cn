import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

/**
 * 加密服务：封装 bcrypt hash/compare + AES-256-GCM 对称加密
 * 数据合同真源：spec.md - JWT 认证机制 (密码 bcrypt 加密)
 * 数据合同真源：Task 32 - API Key 池 AES 加密存储
 */
@Injectable()
export class EncryptionService {
  private readonly saltRounds = 12;
  private readonly aesKey: Buffer;

  constructor(private config: ConfigService) {
    const raw = this.config.get<string>('AES_KEY');
    if (!raw) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('AES_KEY 未设置：生产环境必须配置 AES_KEY 环境变量，应用拒绝启动');
      }
      // 非生产环境使用明显的开发密钥
      console.warn('[安全警告] AES_KEY 未设置，使用开发专用密钥。请勿在生产环境使用！');
      this.aesKey = crypto.createHash('sha256').update('dev-only-aes-key-not-for-production-32b').digest();
      return;
    }
    this.aesKey = crypto.createHash('sha256').update(raw).digest();
  }

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  async compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * AES-256-GCM 加密
   * 输出格式：base64(iv) : base64(authTag) : base64(ciphertext)
   */
  encryptAes(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.aesKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /** AES-256-GCM 解密 */
  decryptAes(cipherText: string): string {
    const parts = cipherText.split(':');
    if (parts.length !== 3) {
      throw new Error('无效的密文格式');
    }
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.aesKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  /** 对加密密文做脱敏显示 (如 sk-****ab12) */
  maskKey(cipherText: string): string {
    try {
      const plain = this.decryptAes(cipherText);
      if (plain.length <= 8) return '****';
      return plain.slice(0, 3) + '****' + plain.slice(-4);
    } catch {
      return '****';
    }
  }
}

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
  private readonly saltRounds = 10;
  private readonly aesKey: Buffer;

  constructor(private config: ConfigService) {
    // AES 密钥：32 字节，优先取 AES_KEY 环境变量，缺省用内置默认（生产应配置 AES_KEY）
    const raw = this.config.get<string>(
      'AES_KEY',
      'shentong-ai-default-aes-key-32bytes!!',
    );
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
}

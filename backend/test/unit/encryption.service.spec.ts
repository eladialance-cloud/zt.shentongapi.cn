/**
 * EncryptionService 单元测试
 * 覆盖：bcrypt hash/compare + AES-256-GCM encrypt/decrypt
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../../src/common/services/encryption.service';
import * as bcrypt from 'bcryptjs';

describe('EncryptionService', () => {
  let service: EncryptionService;
  const mockAesKey = 'test-aes-key-at-least-16-chars!!';

  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'AES_KEY') return mockAesKey;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  describe('hash & compare', () => {
    it('应该成功哈希并验证密码', async () => {
      const plain = 'MyPassword123!';
      const hashed = await service.hash(plain);
      expect(hashed).not.toBe(plain);
      expect(hashed.length).toBeGreaterThan(20);

      const isMatch = await service.compare(plain, hashed);
      expect(isMatch).toBe(true);
    });

    it('错误密码应该返回 false', async () => {
      const plain = 'CorrectPassword123!';
      const wrong = 'WrongPassword456!';
      const hashed = await service.hash(plain);

      const isMatch = await service.compare(wrong, hashed);
      expect(isMatch).toBe(false);
    });

    it('每次哈希结果应该不同（salt）', async () => {
      const plain = 'SamePassword123!';
      const hash1 = await service.hash(plain);
      const hash2 = await service.hash(plain);
      expect(hash1).not.toBe(hash2);

      // 两者都能验证通过
      expect(await service.compare(plain, hash1)).toBe(true);
      expect(await service.compare(plain, hash2)).toBe(true);
    });
  });

  describe('AES-256-GCM encrypt & decrypt', () => {
    it('应该成功加密并解密文本', () => {
      const plain = 'sk-1234567890abcdef';
      const encrypted = service.encryptAes(plain);

      // 密文格式：base64(iv):base64(authTag):base64(ciphertext)
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);

      const decrypted = service.decryptAes(encrypted);
      expect(decrypted).toBe(plain);
    });

    it('每次加密结果应该不同（随机 IV）', () => {
      const plain = 'test-api-key';
      const enc1 = service.encryptAes(plain);
      const enc2 = service.encryptAes(plain);
      expect(enc1).not.toBe(enc2);

      // 两者都能正确解密
      expect(service.decryptAes(enc1)).toBe(plain);
      expect(service.decryptAes(enc2)).toBe(plain);
    });

    it('空字符串应该可以正常加密解密', () => {
      const plain = '';
      const encrypted = service.encryptAes(plain);
      const decrypted = service.decryptAes(encrypted);
      expect(decrypted).toBe(plain);
    });

    it('中文字符串应该可以正常加密解密', () => {
      const plain = '这是一个API密钥';
      const encrypted = service.encryptAes(plain);
      const decrypted = service.decryptAes(encrypted);
      expect(decrypted).toBe(plain);
    });

    it('长字符串应该可以正常加密解密', () => {
      const plain = 'A'.repeat(10000);
      const encrypted = service.encryptAes(plain);
      const decrypted = service.decryptAes(encrypted);
      expect(decrypted).toBe(plain);
    });

    it('无效密文格式应该抛出错误', () => {
      expect(() => service.decryptAes('invalid-cipher-text')).toThrow();
    });

    it('篡改密文应该导致解密失败（GCM 完整性校验）', () => {
      const plain = 'secret-data';
      const encrypted = service.encryptAes(plain);
      const parts = encrypted.split(':');

      // 篡改密文部分
      const tamperedCiphertext = parts[2].slice(0, -4) + 'AAAA';
      const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;

      expect(() => service.decryptAes(tampered)).toThrow();
    });

    it('篡改 authTag 应该导致解密失败', () => {
      const plain = 'secret-data';
      const encrypted = service.encryptAes(plain);
      const parts = encrypted.split(':');

      // 篡改 authTag
      const tamperedTag = parts[1].slice(0, -4) + 'AAAA';
      const tampered = `${parts[0]}:${tamperedTag}:${parts[2]}`;

      expect(() => service.decryptAes(tampered)).toThrow();
    });
  });

  describe('AES_KEY 缺失', () => {
    it('应该抛出 ConfigurationError', async () => {
      expect.assertions(1);
      try {
        await Test.createTestingModule({
          providers: [
            EncryptionService,
            {
              provide: ConfigService,
              useValue: {
                get: jest.fn(() => undefined),
              },
            },
          ],
        }).compile();
      } catch (e: any) {
        expect(e.message).toContain('AES_KEY is required');
      }
    });
  });
});

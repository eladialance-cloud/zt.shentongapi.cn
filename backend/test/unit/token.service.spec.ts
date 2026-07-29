/**
 * TokenService 单元测试
 * 覆盖：AccessToken 生成、RefreshToken 生成/验证/撤销/轮换
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from '../../src/modules/auth/services/token.service';
import { RedisService } from '../../src/common/services/redis.service';
import { JwtPayload } from '../../src/modules/auth/strategies/jwt.strategy';

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: JwtService;
  let redisService: RedisService;

  const mockRedis = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: string) => {
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      if (key === 'JWT_SECRET') return 'test-jwt-secret-at-least-32-chars-please';
      return defaultVal;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<TokenService>(TokenService);
    jwtService = module.get<JwtService>(JwtService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('generateAccessToken', () => {
    it('应该调用 jwtService.signAsync 并返回 token', async () => {
      const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
        sub: 1,
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
      };
      const mockToken = 'mock-access-token';
      mockJwtService.signAsync.mockResolvedValue(mockToken);

      const result = await service.generateAccessToken(payload);

      expect(mockJwtService.signAsync).toHaveBeenCalledWith({
        sub: 1,
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user'],
      });
      expect(result).toBe(mockToken);
    });
  });

  describe('generateRefreshToken', () => {
    it('应该生成 UUID 格式的 refresh token 并存入 Redis', async () => {
      const userId = 1;
      mockRedis.set.mockResolvedValue(undefined);

      const result = await service.generateRefreshToken(userId);

      // UUID v4 格式校验
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      // 写入 Redis，key 前缀正确，TTL = 7天 = 604800 秒
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining(result),
        String(userId),
        7 * 24 * 3600,
      );
    });

    it('应该支持不同 TTL 格式 (1h)', async () => {
      mockConfigService.get.mockReturnValue('1h');

      const result = await service.generateRefreshToken(1);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        3600, // 1 小时 = 3600 秒
      );
    });

    it('应该支持不同 TTL 格式 (3600s)', async () => {
      mockConfigService.get.mockReturnValue('3600');

      await service.generateRefreshToken(1);

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        3600,
      );
    });
  });

  describe('verifyRefreshToken', () => {
    it('有效 token 应该返回 userId', async () => {
      const token = 'valid-refresh-token';
      const userId = '42';
      mockRedis.get.mockResolvedValue(userId);

      const result = await service.verifyRefreshToken(token);

      expect(mockRedis.get).toHaveBeenCalledWith(
        expect.stringContaining(token),
      );
      expect(result).toBe(42);
    });

    it('无效 token 应该返回 null', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.verifyRefreshToken('invalid-token');

      expect(result).toBeNull();
    });

    it('空字符串 token 应该返回 null', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.verifyRefreshToken('');

      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('应该从 Redis 删除 token', async () => {
      const token = 'token-to-revoke';
      mockRedis.del.mockResolvedValue(undefined);

      await service.revokeRefreshToken(token);

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining(token),
      );
    });

    it('空 token 不应该抛出异常', async () => {
      mockRedis.del.mockResolvedValue(undefined);

      await expect(service.revokeRefreshToken('')).resolves.not.toThrow();
    });
  });

  describe('parseTtl', () => {
    it('应该正确解析 "7d" 格式', async () => {
      mockConfigService.get.mockReturnValue('7d');
      await service.generateRefreshToken(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        7 * 24 * 3600,
      );
    });

    it('应该正确解析 "30m" 格式', async () => {
      mockConfigService.get.mockReturnValue('30m');
      await service.generateRefreshToken(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        30 * 60,
      );
    });

    it('应该正确解析 "3600" 格式（默认秒）', async () => {
      mockConfigService.get.mockReturnValue('3600');
      await service.generateRefreshToken(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        3600,
      );
    });

    it('无效格式应该使用默认值 7 天', async () => {
      mockConfigService.get.mockReturnValue('invalid');
      await service.generateRefreshToken(1);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        7 * 24 * 3600,
      );
    });
  });
});

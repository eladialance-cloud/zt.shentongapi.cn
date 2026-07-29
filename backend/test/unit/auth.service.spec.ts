/**
 * AuthService 单元测试
 * 覆盖：register、login、refresh、logout、forgotPassword、resetPassword
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { Response } from 'express';
import { AuthService } from '../../src/modules/auth/services/auth.service';
import { UserService } from '../../src/modules/user/services/user.service';
import { EncryptionService } from '../../src/common/services/encryption.service';
import { TokenService } from '../../src/modules/auth/services/token.service';
import { EmailService } from '../../src/modules/auth/services/email.service';
import { DeviceService } from '../../src/modules/device/device.service';
import { InviteCodeService } from '../../src/modules/user/invite-code.service';
import { RedisService } from '../../src/common/services/redis.service';
import { BusinessException } from '../../src/common/exceptions/business.exception';
import { ErrorCode } from '../../src/common/constants/error.constant';

describe('AuthService', () => {
  let service: AuthService;
  let userService: UserService;
  let encryptionService: EncryptionService;
  let tokenService: TokenService;
  let emailService: EmailService;
  let deviceService: DeviceService;
  let inviteCodeService: InviteCodeService;
  let redisService: RedisService;
  let dataSource: DataSource;

  const mockUserService = {
    findByUsername: jest.fn(),
    findByEmail: jest.fn(),
    findByIdWithPassword: jest.fn(),
    findById: jest.fn(),
    findUserRoles: jest.fn(),
    createUserWithEntityManager: jest.fn(),
    update: jest.fn(),
    updatePassword: jest.fn(),
  };

  const mockEncryption = {
    hash: jest.fn(),
    compare: jest.fn(),
    encryptAes: jest.fn(),
    decryptAes: jest.fn(),
  };

  const mockTokenService = {
    generateAccessToken: jest.fn(),
    generateRefreshToken: jest.fn(),
    verifyRefreshToken: jest.fn(),
    revokeRefreshToken: jest.fn(),
  };

  const mockEmailService = {
    sendPasswordResetEmail: jest.fn(),
  };

  const mockDeviceService = {
    findByFingerprint: jest.fn(),
    getUserDeviceCount: jest.fn(),
    bindDevice: jest.fn(),
    updateLoginInfo: jest.fn(),
  };

  const mockInviteCodeService = {
    validateCode: jest.fn(),
    consumeCodeWithEntityManager: jest.fn(),
  };

  const mockRedis = {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultVal?: string) => {
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
      return defaultVal;
    }),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: mockUserService },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: TokenService, useValue: mockTokenService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: DeviceService, useValue: mockDeviceService },
        { provide: InviteCodeService, useValue: mockInviteCodeService },
        { provide: RedisService, useValue: mockRedis },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ============ register ============

  describe('register', () => {
    const registerDto = {
      username: 'newuser',
      email: 'new@example.com',
      password: 'Password123!',
      inviteCode: 'INVITE001',
    };

    const mockRes = {
      cookie: jest.fn(),
    } as unknown as Response;

    it('注册成功：返回 accessToken + refreshToken + secretKey + user', async () => {
      mockUserService.findByUsername.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(null);
      mockInviteCodeService.validateCode.mockResolvedValue({ inviterId: 10 });
      mockDataSource.transaction.mockImplementation(async (cb) => {
        const mockEntityManager = {
          // 传递给 createUserWithEntityManager 和 consumeCodeWithEntityManager
        };
        mockEncryption.hash.mockResolvedValue('hashed-password');
        mockUserService.createUserWithEntityManager.mockResolvedValue({
          id: 1,
          username: 'newuser',
          email: 'new@example.com',
          phone: null,
          avatar: null,
          status: 'active',
          level: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        mockUserService.findUserRoles.mockResolvedValue(['user']);
        mockTokenService.generateAccessToken.mockResolvedValue('access-token');
        mockTokenService.generateRefreshToken.mockResolvedValue('refresh-token');
        mockRedis.set.mockResolvedValue(undefined);

        return cb(mockEntityManager);
      });

      const result = await service.register(registerDto, mockRes);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.secretKey).toBeDefined();
      expect(result.user.username).toBe('newuser');
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/auth',
        }),
      );
    });

    it('用户名已存在应该抛出异常', async () => {
      mockUserService.findByUsername.mockResolvedValue({ id: 1 });

      await expect(service.register(registerDto, mockRes)).rejects.toThrow(
        BusinessException,
      );
    });

    it('邮箱已注册应该抛出异常', async () => {
      mockUserService.findByUsername.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue({ id: 2 });

      await expect(service.register(registerDto, mockRes)).rejects.toThrow(
        BusinessException,
      );
    });

    it('无效邀请码应该抛出异常', async () => {
      mockUserService.findByUsername.mockResolvedValue(null);
      mockUserService.findByEmail.mockResolvedValue(null);
      mockInviteCodeService.validateCode.mockResolvedValue(null);

      await expect(service.register(registerDto, mockRes)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  // ============ login ============

  describe('login', () => {
    const loginDto = {
      account: 'testuser',
      password: 'Password123!',
    };

    const mockRes = {
      cookie: jest.fn(),
    } as unknown as Response;

    it('登录成功：返回 tokens 和 user', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        status: 'active',
      };
      mockUserService.findByUsername.mockResolvedValue(mockUser);
      mockUserService.findByIdWithPassword.mockResolvedValue({
        ...mockUser,
        password: 'hashed-password',
      });
      mockEncryption.compare.mockResolvedValue(true);
      mockUserService.findUserRoles.mockResolvedValue(['user']);
      mockTokenService.generateAccessToken.mockResolvedValue('access-token');
      mockTokenService.generateRefreshToken.mockResolvedValue('refresh-token');
      mockRedis.set.mockResolvedValue(undefined);

      const result = await service.login(loginDto, '127.0.0.1', mockRes);

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user.username).toBe('testuser');
      expect(mockRes.cookie).toHaveBeenCalled();
    });

    it('用户不存在应该抛出 INVALID_CREDENTIALS', async () => {
      mockUserService.findByUsername.mockResolvedValue(null);

      await expect(
        service.login(loginDto, '127.0.0.1', mockRes),
      ).rejects.toThrow(BusinessException);
    });

    it('已删除用户应该抛出 INVALID_CREDENTIALS', async () => {
      mockUserService.findByUsername.mockResolvedValue({
        id: 1,
        status: 'deleted',
      });

      await expect(
        service.login(loginDto, '127.0.0.1', mockRes),
      ).rejects.toThrow(BusinessException);
    });

    it('被封禁用户应该抛出 FORBIDDEN', async () => {
      mockUserService.findByUsername.mockResolvedValue({
        id: 1,
        status: 'banned',
        banUntil: null,
      });

      await expect(
        service.login(loginDto, '127.0.0.1', mockRes),
      ).rejects.toThrow(BusinessException);
    });

    it('密码错误应该抛出 INVALID_CREDENTIALS', async () => {
      mockUserService.findByUsername.mockResolvedValue({
        id: 1,
        status: 'active',
      });
      mockUserService.findByIdWithPassword.mockResolvedValue({
        id: 1,
        password: 'hashed-password',
      });
      mockEncryption.compare.mockResolvedValue(false);

      await expect(
        service.login(loginDto, '127.0.0.1', mockRes),
      ).rejects.toThrow(BusinessException);
    });

    it('邮箱登录应该正常工作', async () => {
      const emailLoginDto = {
        account: 'test@example.com',
        password: 'Password123!',
      };
      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        status: 'active',
      };
      mockUserService.findByEmail.mockResolvedValue(mockUser);
      mockUserService.findByIdWithPassword.mockResolvedValue({
        ...mockUser,
        password: 'hashed-password',
      });
      mockEncryption.compare.mockResolvedValue(true);
      mockUserService.findUserRoles.mockResolvedValue(['user']);
      mockTokenService.generateAccessToken.mockResolvedValue('access-token');
      mockTokenService.generateRefreshToken.mockResolvedValue('refresh-token');
      mockRedis.set.mockResolvedValue(undefined);

      const result = await service.login(emailLoginDto, '127.0.0.1', mockRes);

      expect(result.accessToken).toBe('access-token');
      expect(mockUserService.findByEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('新设备指纹：超过3台上限应该抛出异常', async () => {
      const loginWithDevice = {
        account: 'testuser',
        password: 'Password123!',
        deviceFingerprint: 'a'.repeat(64),
        deviceName: 'Test Device',
        deviceType: 'win32',
      };
      mockUserService.findByUsername.mockResolvedValue({
        id: 1,
        status: 'active',
      });
      mockUserService.findByIdWithPassword.mockResolvedValue({
        id: 1,
        password: 'hashed-password',
      });
      mockEncryption.compare.mockResolvedValue(true);
      mockDeviceService.findByFingerprint.mockResolvedValue(null);
      mockDeviceService.getUserDeviceCount.mockResolvedValue(3);

      await expect(
        service.login(loginWithDevice, '127.0.0.1', mockRes),
      ).rejects.toThrow(BusinessException);
    });

    it('临时封禁已过期应该恢复登录', async () => {
      const pastDate = new Date(Date.now() - 86400000); // 1天前
      mockUserService.findByUsername.mockResolvedValue({
        id: 1,
        status: 'banned',
        banUntil: pastDate,
      });
      mockUserService.findByIdWithPassword.mockResolvedValue({
        id: 1,
        password: 'hashed-password',
      });
      mockEncryption.compare.mockResolvedValue(true);
      mockUserService.findUserRoles.mockResolvedValue(['user']);
      mockTokenService.generateAccessToken.mockResolvedValue('access-token');
      mockTokenService.generateRefreshToken.mockResolvedValue('refresh-token');
      mockRedis.set.mockResolvedValue(undefined);

      const result = await service.login(loginDto, '127.0.0.1', mockRes);

      expect(result.accessToken).toBe('access-token');
      expect(mockUserService.update).toHaveBeenCalledWith(1, { status: 'active' });
    });
  });

  // ============ refresh ============

  describe('refresh', () => {
    const mockRes = {
      cookie: jest.fn(),
    } as unknown as Response;

    it('有效 refresh token 应该返回新的 accessToken 和 refreshToken', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(1);
      mockUserService.findById.mockResolvedValue({
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
      });
      mockUserService.findUserRoles.mockResolvedValue(['user']);
      mockTokenService.revokeRefreshToken.mockResolvedValue(undefined);
      mockTokenService.generateAccessToken.mockResolvedValue('new-access');
      mockTokenService.generateRefreshToken.mockResolvedValue('new-refresh');

      const result = await service.refresh('old-refresh-token', mockRes);

      expect(result.accessToken).toBe('new-access');
      expect(result.refreshToken).toBe('new-refresh');
      expect(mockTokenService.revokeRefreshToken).toHaveBeenCalledWith('old-refresh-token');
      expect(mockRes.cookie).toHaveBeenCalled();
    });

    it('无效 refresh token 应该抛出 TOKEN_EXPIRED', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(null);

      await expect(
        service.refresh('invalid-token', mockRes),
      ).rejects.toThrow(BusinessException);
    });

    it('用户不存在应该抛出 USER_NOT_FOUND', async () => {
      mockTokenService.verifyRefreshToken.mockResolvedValue(999);
      mockUserService.findById.mockResolvedValue(null);

      await expect(
        service.refresh('valid-token', mockRes),
      ).rejects.toThrow(BusinessException);
    });
  });

  // ============ logout ============

  describe('logout', () => {
    it('应该撤销 refresh token', async () => {
      mockTokenService.revokeRefreshToken.mockResolvedValue(undefined);

      const result = await service.logout('some-refresh-token');

      expect(mockTokenService.revokeRefreshToken).toHaveBeenCalledWith('some-refresh-token');
      expect(result).toBeNull();
    });

    it('空 token 不应该抛出异常', async () => {
      const result = await service.logout('');

      expect(result).toBeNull();
    });
  });

  // ============ forgotPassword ============

  describe('forgotPassword', () => {
    it('用户存在：应该发送重置邮件', async () => {
      mockUserService.findByEmail.mockResolvedValue({ id: 1, email: 'test@example.com' });
      mockRedis.set.mockResolvedValue(undefined);
      mockEmailService.sendPasswordResetEmail.mockResolvedValue(undefined);

      await service.forgotPassword('test@example.com');

      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('pwd:reset:'),
        '1',
        30 * 60,
      );
      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringContaining('https://app.shentong.ai/reset-password?token='),
      );
    });

    it('用户不存在：静默返回（不泄露邮箱）', async () => {
      mockUserService.findByEmail.mockResolvedValue(null);

      await service.forgotPassword('nonexistent@example.com');

      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  // ============ resetPassword ============

  describe('resetPassword', () => {
    it('有效 token：应该重置密码', async () => {
      mockRedis.get.mockResolvedValue('1');
      mockUserService.findById.mockResolvedValue({ id: 1 });
      mockEncryption.hash.mockResolvedValue('new-hashed-password');
      mockUserService.updatePassword.mockResolvedValue(undefined);
      mockRedis.del.mockResolvedValue(undefined);

      await service.resetPassword('valid-token', 'NewPassword123!');

      expect(mockEncryption.hash).toHaveBeenCalledWith('NewPassword123!');
      expect(mockUserService.updatePassword).toHaveBeenCalledWith(1, 'new-hashed-password');
      expect(mockRedis.del).toHaveBeenCalledWith(expect.stringContaining('valid-token'));
    });

    it('无效 token：应该抛出异常', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.resetPassword('invalid-token', 'NewPassword123!'),
      ).rejects.toThrow(BusinessException);
    });
  });

  // ============ validateUser ============

  describe('validateUser', () => {
    it('有效凭据：返回用户信息（不含密码）', async () => {
      mockUserService.findByUsername.mockResolvedValue({
        id: 1,
        username: 'testuser',
      });
      mockUserService.findByIdWithPassword.mockResolvedValue({
        id: 1,
        username: 'testuser',
        password: 'hashed-password',
      });
      mockEncryption.compare.mockResolvedValue(true);
      mockUserService.findUserRoles.mockResolvedValue(['user']);

      const result = await service.validateUser('testuser', 'Password123!');

      expect(result).toBeDefined();
      expect(result.username).toBe('testuser');
      expect(result.password).toBeUndefined();
    });

    it('用户不存在：返回 null', async () => {
      mockUserService.findByUsername.mockResolvedValue(null);

      const result = await service.validateUser('nonexistent', 'Password123!');

      expect(result).toBeNull();
    });

    it('密码错误：返回 null', async () => {
      mockUserService.findByUsername.mockResolvedValue({ id: 1 });
      mockUserService.findByIdWithPassword.mockResolvedValue({
        id: 1,
        password: 'hashed-password',
      });
      mockEncryption.compare.mockResolvedValue(false);

      const result = await service.validateUser('testuser', 'WrongPassword!');

      expect(result).toBeNull();
    });
  });
});

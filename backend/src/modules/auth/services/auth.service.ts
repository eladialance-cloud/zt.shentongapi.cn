import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../../user/services/user.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { TokenService } from './token.service';
import { EmailService } from './email.service';
import { DeviceService } from '../../device/device.service';
import { InviteCodeService } from '../../user/invite-code.service';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { RedisService } from '../../../common/services/redis.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { isEmail, generateRandomString } from '../../../common/utils/string.util';

/** Redis key 前缀：HMAC 密钥（key: hmac:secret:<userId>） */
const HMAC_SECRET_PREFIX = 'hmac:secret:';
/** Redis key 前缀：密码重置令牌（key: pwd:reset:<token>） */
const PWD_RESET_PREFIX = 'pwd:reset:';
/** 密码重置令牌有效期（秒）：30 分钟 */
const PWD_RESET_TTL = 30 * 60;
/** 密码重置链接模板 */
const RESET_LINK_TEMPLATE = 'https://app.shentong.ai/reset-password?token=';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private encryption: EncryptionService,
    private tokenService: TokenService,
    private emailService: EmailService,
    private deviceService: DeviceService,
    private inviteCodeService: InviteCodeService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    // 检查用户名/邮箱是否已存在
    const existsByUsername = await this.userService.findByUsername(dto.username);
    if (existsByUsername) {
      BusinessException.throw(ErrorCode.USER_EXISTS, '用户名已被使用');
    }
    const existsByEmail = await this.userService.findByEmail(dto.email);
    if (existsByEmail) {
      BusinessException.throw(ErrorCode.USER_EXISTS, '邮箱已被注册');
    }

    // 邀请码校验（提供时校验，不消费——注册成功后才消费）
    let inviterId: number | undefined;
    if (dto.inviteCode) {
      const inviteCode = await this.inviteCodeService.validateCode(dto.inviteCode);
      if (!inviteCode) {
        BusinessException.throw(ErrorCode.INVITE_CODE_INVALID, '邀请码无效或已过期');
      }
      inviterId = inviteCode.inviterId;
    }

    // 创建用户
    const hashedPassword = await this.encryption.hash(dto.password);
    const user = await this.userService.createUser({
      username: dto.username,
      email: dto.email,
      password: hashedPassword,
      inviteCode: undefined,
      inviterId,
      registerSource: dto.inviteCode ? 'invite' : 'direct',
    });

    // 注册成功后消费邀请码
    if (dto.inviteCode) {
      await this.inviteCodeService.consumeCode(dto.inviteCode, user.id);
    }

    // 生成 tokens
    const roles = await this.userService.findUserRoles(user.id);
    const accessToken = await this.tokenService.generateAccessToken({
      sub: user.id,
      username: user.username,
      email: user.email,
      roles,
    });
    const refreshToken = await this.tokenService.generateRefreshToken(user.id);
    const secretKey = await this.generateAndStoreSecretKey(user.id);

    return {
      accessToken,
      refreshToken,
      secretKey,
      user: this.sanitizeUser(user, roles),
    };
  }

  async login(dto: LoginDto, ip: string) {
    let user: any;
    if (isEmail(dto.account)) {
      user = await this.userService.findByEmail(dto.account);
    } else {
      user = await this.userService.findByUsername(dto.account);
    }

    if (!user) {
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    // user.password 是 select: false,需要手动带 password 查询
    const userWithPwd = await this.userService.findByIdWithPassword(user.id);
    const isMatch = await this.encryption.compare(dto.password, userWithPwd.password);
    if (!isMatch) {
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    // 设备校验（客户端提供了设备指纹时执行）
    if (dto.deviceFingerprint) {
      const existingDevice = await this.deviceService.findByFingerprint(
        user.id,
        dto.deviceFingerprint,
      );
      if (!existingDevice) {
        // 新设备：校验绑定数量上限（3 台）
        const deviceCount = await this.deviceService.getUserDeviceCount(user.id);
        if (deviceCount >= 3) {
          BusinessException.throw(
            ErrorCode.DEVICE_LIMIT_EXCEEDED,
            '已绑定设备数超过限制（最多 3 台），请先解绑旧设备',
          );
        }
        // 未超限，自动绑定新设备
        await this.deviceService.bindDevice(
          user.id,
          {
            deviceFingerprint: dto.deviceFingerprint,
            deviceName: dto.deviceName || '未知设备',
            deviceType: dto.deviceType || 'unknown',
          },
          ip,
        );
      } else {
        // 已绑定：更新最近登录信息
        await this.deviceService.updateLoginInfo(existingDevice.id, ip);
      }
    }

    const roles = await this.userService.findUserRoles(user.id);
    const accessToken = await this.tokenService.generateAccessToken({
      sub: user.id,
      username: user.username,
      email: user.email,
      roles,
    });
    const refreshToken = await this.tokenService.generateRefreshToken(user.id);
    const secretKey = await this.generateAndStoreSecretKey(user.id);

    return {
      accessToken,
      refreshToken,
      secretKey,
      user: this.sanitizeUser(user, roles),
    };
  }

  async refresh(refreshToken: string) {
    const userId = await this.tokenService.verifyRefreshToken(refreshToken);
    if (!userId) {
      BusinessException.throw(ErrorCode.TOKEN_EXPIRED, 'refreshToken已失效,请重新登录');
    }
    const user = await this.userService.findById(userId);
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    const roles = await this.userService.findUserRoles(user.id);

    // 撤销旧 refresh token,签发新的
    await this.tokenService.revokeRefreshToken(refreshToken);
    const accessToken = await this.tokenService.generateAccessToken({
      sub: user.id,
      username: user.username,
      email: user.email,
      roles,
    });
    const newRefreshToken = await this.tokenService.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string) {
    if (refreshToken) {
      await this.tokenService.revokeRefreshToken(refreshToken);
    }
    return null;
  }

  /**
   * 忘记密码：生成重置令牌并发送邮件
   * 用户不存在时静默返回（不泄露邮箱是否注册）
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      // 静默返回，不泄露邮箱是否存在
      return;
    }

    const token = generateRandomString(64);
    await this.redis.set(
      `${PWD_RESET_PREFIX}${token}`,
      String(user.id),
      PWD_RESET_TTL,
    );

    const resetLink = `${RESET_LINK_TEMPLATE}${token}`;
    await this.emailService.sendPasswordResetEmail(email, resetLink);
  }

  /**
   * 重置密码
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userIdStr = await this.redis.get(`${PWD_RESET_PREFIX}${token}`);
    if (!userIdStr) {
      BusinessException.throw(ErrorCode.INVALID_OR_EXPIRED_TOKEN, '重置令牌无效或已过期');
    }

    const userId = Number(userIdStr);
    // 校验用户存在
    await this.userService.findById(userId);

    // 重新哈希密码并更新
    const hashedPassword = await this.encryption.hash(newPassword);
    await this.userService.updatePassword(userId, hashedPassword);

    // 删除已使用的重置令牌
    await this.redis.del(`${PWD_RESET_PREFIX}${token}`);
  }

  async validateUser(account: string, password: string): Promise<any> {
    let user: any;
    if (isEmail(account)) {
      user = await this.userService.findByEmail(account);
    } else {
      user = await this.userService.findByUsername(account);
    }
    if (!user) return null;
    const userWithPwd = await this.userService.findByIdWithPassword(user.id);
    const isMatch = await this.encryption.compare(password, userWithPwd.password);
    if (!isMatch) return null;
    const roles = await this.userService.findUserRoles(user.id);
    return this.sanitizeUser(user, roles);
  }

  private sanitizeUser(user: any, roles: string[]) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      status: user.status,
      level: user.level,
      roles,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * 生成 HMAC 密钥（32 字节 hex）并存入 Redis
   * TTL 与 refresh token 相同（7 天）
   */
  private async generateAndStoreSecretKey(userId: number): Promise<string> {
    const secretKey = generateRandomString(64); // 64 字符 hex = 32 字节
    const ttl = this.parseRefreshTtl();
    await this.redis.set(`${HMAC_SECRET_PREFIX}${userId}`, secretKey, ttl);
    return secretKey;
  }

  /** 解析 JWT_REFRESH_EXPIRES_IN 配置为秒数 */
  private parseRefreshTtl(): number {
    const ttl = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const match = ttl.match(/^(\d+)([smhd])?$/);
    if (!match) return 7 * 24 * 3600;
    const num = parseInt(match[1], 10);
    const unit = match[2] || 's';
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return num * multipliers[unit];
  }
}

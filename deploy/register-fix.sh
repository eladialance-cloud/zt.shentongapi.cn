#!/bin/bash
# register-fix.sh - 在服务器上直接修改注册相关文件
cd /opt/shentong/backend/src/modules/auth

# 备份
cp dto/register.dto.ts dto/register.dto.ts.bak
cp services/auth.service.ts services/auth.service.ts.bak

# 1. 写入 register.dto.ts
cat << 'DTOEOF' > dto/register.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: '用户名', example: 'shentong' })
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @Matches(/^[a-zA-Z0-9_]{3,32}$/, { message: '用户名只能包含字母、数字、下划线,长度3-32' })
  username: string;

  @ApiProperty({ description: '邮箱', example: 'user@example.com' })
  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @ApiProperty({ description: '密码', example: 'Pass1234' })
  @IsString()
  @MinLength(8, { message: '密码至少8位' })
  @MaxLength(64, { message: '密码最多64位' })
  password: string;

  @ApiProperty({ description: '邀请码', required: false })
  @IsOptional()
  @IsString()
  inviteCode?: string;
}
DTOEOF

# 2. 写入 auth.service.ts
cat << 'AUTHEOF' > services/auth.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { DataSource } from 'typeorm';
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

const HMAC_SECRET_PREFIX = 'hmac:secret:';
const PWD_RESET_PREFIX = 'pwd:reset:';
const PWD_RESET_TTL = 30 * 60;
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
    private dataSource: DataSource,
  ) {}

  async register(dto: RegisterDto, res: Response) {
    const existsByUsername = await this.userService.findByUsername(dto.username);
    if (existsByUsername) {
      BusinessException.throw(ErrorCode.USER_EXISTS, '用户名已被使用');
    }
    const existsByEmail = await this.userService.findByEmail(dto.email);
    if (existsByEmail) {
      BusinessException.throw(ErrorCode.USER_EXISTS, '邮箱已被注册');
    }

    let inviterId: number | undefined;
    let inviteCodeValidated = false;
    if (dto.inviteCode) {
      const inviteCode = await this.inviteCodeService.validateCode(dto.inviteCode);
      if (!inviteCode) {
        BusinessException.throw(ErrorCode.INVITE_CODE_INVALID, '邀请码无效或已过期');
      }
      inviterId = inviteCode.inviterId;
      inviteCodeValidated = true;
    }

    const result = await this.dataSource.transaction(async (entityManager) => {
      const hashedPassword = await this.encryption.hash(dto.password);
      const user = await this.userService.createUserWithEntityManager(entityManager, {
        username: dto.username,
        email: dto.email,
        password: hashedPassword,
        inviteCode: dto.inviteCode,
        inviterId,
        registerSource: dto.inviteCode ? 'invite' : 'direct',
      });

      if (inviteCodeValidated && dto.inviteCode) {
        await this.inviteCodeService.consumeCodeWithEntityManager(entityManager, dto.inviteCode, user.id);
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
      const llmProxyKey = await this.ensureLlmProxyKey(user.id);

      return {
        accessToken,
        refreshToken,
        secretKey,
        llmProxyKey,
        user: this.sanitizeUser(user, roles),
      };
    });

    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  async login(dto: LoginDto, ip: string, res: Response) {
    let user: any;
    if (isEmail(dto.account)) {
      user = await this.userService.findByEmail(dto.account);
    } else {
      user = await this.userService.findByUsername(dto.account);
    }

    if (!user) {
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    if (user.status === 'deleted') {
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    if (user.status === 'banned') {
      const banUntil = (user as any).banUntil;
      if (banUntil && new Date(banUntil) < new Date()) {
        await this.userService.update(user.id, { status: 'active' } as any);
      } else {
        BusinessException.throw(ErrorCode.FORBIDDEN, '账号已被封禁');
      }
    }

    const userWithPwd = await this.userService.findByIdWithPassword(user.id);
    const isMatch = await this.encryption.compare(dto.password, userWithPwd.password);
    if (!isMatch) {
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    if (dto.deviceFingerprint) {
      const existingDevice = await this.deviceService.findByFingerprint(
        user.id,
        dto.deviceFingerprint,
      );
      if (!existingDevice) {
        const deviceCount = await this.deviceService.getUserDeviceCount(user.id);
        if (deviceCount >= 3) {
          BusinessException.throw(
            ErrorCode.DEVICE_LIMIT_EXCEEDED,
            '已绑定设备数超过限制（最多 3 台），请先解绑旧设备',
          );
        }
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
    const llmProxyKey = await this.ensureLlmProxyKey(user.id);

    this.setRefreshCookie(res, refreshToken);

    return {
      accessToken,
      refreshToken,
      secretKey,
      llmProxyKey,
      user: this.sanitizeUser(user, roles),
    };
  }

  private async ensureLlmProxyKey(userId: number): Promise<string> {
    const user = await this.userService.findById(userId);
    if (user && (user as any).llmProxyKey) return (user as any).llmProxyKey;
    const newKey = 'sk-shentong-' + require('crypto').randomBytes(16).toString('hex');
    await this.userService.update(userId, { llmProxyKey: newKey } as any);
    return newKey;
  }

  async regenerateLlmProxyKey(userId: number): Promise<string> {
    const newKey = 'sk-shentong-' + require('crypto').randomBytes(16).toString('hex');
    await this.userService.update(userId, { llmProxyKey: newKey } as any);
    return newKey;
  }

  async refresh(refreshToken: string, res: Response) {
    const userId = await this.tokenService.verifyRefreshToken(refreshToken);
    if (!userId) {
      BusinessException.throw(ErrorCode.TOKEN_EXPIRED, 'refreshToken已失效,请重新登录');
    }
    const user = await this.userService.findById(userId);
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    const roles = await this.userService.findUserRoles(user.id);

    await this.tokenService.revokeRefreshToken(refreshToken);
    const accessToken = await this.tokenService.generateAccessToken({
      sub: user.id,
      username: user.username,
      email: user.email,
      roles,
    });
    const newRefreshToken = await this.tokenService.generateRefreshToken(user.id);

    this.setRefreshCookie(res, newRefreshToken);

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

  async forgotPassword(email: string): Promise<void> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
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

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userIdStr = await this.redis.get(`${PWD_RESET_PREFIX}${token}`);
    if (!userIdStr) {
      BusinessException.throw(ErrorCode.INVALID_OR_EXPIRED_TOKEN, '重置令牌无效或已过期');
    }

    const userId = Number(userIdStr);
    await this.userService.findById(userId);

    const hashedPassword = await this.encryption.hash(newPassword);
    await this.userService.updatePassword(userId, hashedPassword);

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

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private async generateAndStoreSecretKey(userId: number): Promise<string> {
    const secretKey = generateRandomString(64);
    const ttl = this.parseRefreshTtl();
    await this.redis.set(`${HMAC_SECRET_PREFIX}${userId}`, secretKey, ttl);
    return secretKey;
  }

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
AUTHEOF

echo "Files written. Rebuilding backend..."
cd /opt/shentong
docker compose build backend 2>&1 | tail -5
docker compose up -d backend
echo "Waiting for backend to start..."
sleep 8
docker logs shentong-backend --tail 10
echo "Done. Test register:"
echo 'curl -X POST https://zt.shentongapi.cn/api/auth/register -H "Content-Type: application/json" -d "{\"username\":\"testuser03\",\"email\":\"test03@test.com\",\"password\":\"TestPass123\"}"'

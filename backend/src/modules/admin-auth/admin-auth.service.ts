import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../user/entities/user.entity';
import { RoleEntity } from '../user/entities/role.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';
import { RedisService } from '../../common/services/redis.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { loginRateLimiter } from '../../common/utils/login-rate-limiter';

/** Token 黑名单 Redis key 前缀（登出吊销） */
export const ADMIN_TOKEN_BLACKLIST_PREFIX = 'admin:token:blacklist:';

/** 管理端 refresh token Redis key 前缀（7 天有效，登录/续期轮换） */
export const ADMIN_REFRESH_TOKEN_PREFIX = 'admin:refresh:';

/** 管理端 JWT 载荷 */
export interface AdminTokenPayload {
  userId: number;
  username: string;
  role: 'admin';
  /** P0-6: 令牌唯一标识，用于登出黑名单吊销 */
  jti?: string;
}

/** 管理端令牌签发结果 */
export interface AdminLoginResult {
  token: string;
  expiresAt: number;
  user: {
    id: number;
    username: string;
    email?: string;
    avatar?: string;
    roleIds: number[];
    roleCodes: string[];
    status: 'active' | 'disabled';
    createdAt: Date;
    updatedAt: Date;
  };
  permissions: string[];
  /** 是否需要强制修改密码（默认管理员账号首次登录为 true） */
  mustChangePassword: boolean;
  /** 刷新令牌（401 自动续期用，7 天有效，轮换制） */
  refreshToken: string;
}

/**
 * 管理端认证服务
 * 数据合同真源：Task 17 - 管理端认证与权限
 * 管理端使用独立 adminToken（ADMIN_JWT_SECRET），不与用户端 token 混淆。
 */
@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private userRoleRepo: Repository<UserRoleEntity>,
    private jwtService: JwtService,
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  /**
   * 管理员登录
   * 校验用户名 + 密码 + 管理员角色，签发 adminToken 并聚合权限。
   */
  async login(username: string, password: string, ip = ''): Promise<AdminLoginResult> {
    // 登录限流：命中锁定直接 429
    loginRateLimiter.assertNotLocked(ip, username);
    // password 字段 select:false，需手动 addSelect
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.username = :username', { username })
      .getOne();
    if (!user) {
      loginRateLimiter.recordFailure(ip, username);
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      loginRateLimiter.recordFailure(ip, username);
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    const { roleIds, roleCodes, permissions } = await this.loadAdminIdentity(user.id);
    // 仅允许持有 super_admin / admin 角色的账号登录管理端
    if (!roleCodes.some((c) => c === 'super_admin' || c === 'admin')) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '非管理员账号');
    }
    // P0-6: 禁用/删除账号禁止登录管理端
    if (user.status !== 'active') {
      BusinessException.throw(ErrorCode.FORBIDDEN, '账号已禁用，无法登录管理端');
    }

    // 登录成功：清除该账号的失败计数
    loginRateLimiter.reset(ip, username);

    const payload: AdminTokenPayload = {
      userId: user.id,
      username: user.username,
      role: 'admin',
      jti: randomUUID(),
    };
    const adminSecret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!adminSecret) {
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, '管理端密钥未配置');
    }
    const token = await this.jwtService.signAsync(payload, {
      secret: adminSecret,
      expiresIn: this.config.get<string>('ADMIN_JWT_EXPIRES_IN', '8h'),
    });
    const expiresAt = Date.now() + this.parseExpiresMs();

    const refreshToken = await this.generateAdminRefreshToken(user.id);

    return {
      token,
      expiresAt,
      user: this.toAdminUser(user, roleIds, roleCodes),
      permissions,
      mustChangePassword: user.mustChangePassword,
      refreshToken,
    };
  }

  /**
   * 管理员登出：把 token 的 jti 写入 Redis 黑名单（TTL=剩余有效期），
   * 使该 token 立即失效。Redis 不可用时降级为静默放行（不影响登出主流程）。
   */
  async logout(token?: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.revokeAdminRefreshToken(refreshToken);
    }
    if (!token) return;
    try {
      const adminSecret = this.config.get<string>('ADMIN_JWT_SECRET');
      if (!adminSecret) return;
      const payload = await this.jwtService.verifyAsync<{ jti?: string; exp?: number }>(token, {
        secret: adminSecret,
      });
      if (!payload.jti) return;
      const ttlSeconds = payload.exp ? Math.max(1, Math.floor(payload.exp - Date.now() / 1000)) : 8 * 3600;
      await this.redis.set(ADMIN_TOKEN_BLACKLIST_PREFIX + payload.jti, '1', ttlSeconds);
    } catch (err) {
      Logger.warn('[admin-auth] 登出黑名单写入失败（已忽略）: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  /**
   * 获取当前管理员信息 + 权限
   */
  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    const { roleIds, roleCodes, permissions } = await this.loadAdminIdentity(userId);
    return {
      user: this.toAdminUser(user, roleIds, roleCodes),
      permissions,
    };
  }

  /**
   * 修改管理员密码
   * 校验旧密码 → 用 bcrypt 哈希新密码 → 更新 password + mustChangePassword=false
   * 用于默认管理员账号首次登录强制改密场景。
   */
  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    // password 字段 select:false，需手动 addSelect
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.id = :id', { id: userId })
      .getOne();
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      BusinessException.throw(ErrorCode.PASSWORD_INCORRECT);
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await this.userRepo.update(
      { id: userId },
      { password: hashed, mustChangePassword: false },
    );
  }

  /**
   * 加载用户的管理员身份：角色 ID、角色编码、聚合权限
   */
  private async loadAdminIdentity(userId: number) {
    const userRoles = await this.userRoleRepo.find({ where: { userId } });
    const roleIds = userRoles.map((ur) => ur.roleId);
    const roles: RoleEntity[] = roleIds.length
      ? await this.roleRepo.findByIds(roleIds)
      : [];
    const roleCodes = roles
      .map((r) => r.code)
      .filter((c): c is string => !!c);
    const permissions = Array.from(
      new Set(
        roles.flatMap((r) => {
          const p = r.permissions;
          return Array.isArray(p) ? p.map(String) : [];
        }),
      ),
    );
    return { roleIds, roleCodes, permissions };
  }

  private toAdminUser(
    user: UserEntity,
    roleIds: number[],
    roleCodes: string[],
  ) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      roleIds,
      roleCodes,
      status: (user.status === 'active'
        ? 'active'
        : 'disabled') as 'active' | 'disabled',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * 管理端续期：校验 refreshToken → 校验账号仍有效且具管理员角色 → 签发新 accessToken + 轮换 refreshToken
   */
  async refresh(refreshToken: string): Promise<AdminLoginResult> {
    if (!refreshToken) {
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS, 'refreshToken 不能为空');
    }
    const userId = await this.verifyAdminRefreshToken(refreshToken);
    if (!userId) {
      BusinessException.throw(ErrorCode.TOKEN_EXPIRED, '登录已过期，请重新登录');
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    if (user.status !== 'active') {
      BusinessException.throw(ErrorCode.FORBIDDEN, '账号已禁用，无法续期');
    }
    const { roleIds, roleCodes, permissions } = await this.loadAdminIdentity(user.id);
    if (!roleCodes.some((c) => c === 'super_admin' || c === 'admin')) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '非管理员账号');
    }
    // 轮换：撤销旧 refresh token，签发新的
    await this.revokeAdminRefreshToken(refreshToken);
    const newRefreshToken = await this.generateAdminRefreshToken(user.id);

    const payload: AdminTokenPayload = {
      userId: user.id,
      username: user.username,
      role: 'admin',
      jti: randomUUID(),
    };
    const adminSecret = this.config.get<string>('ADMIN_JWT_SECRET');
    if (!adminSecret) {
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, '管理端密钥未配置');
    }
    const token = await this.jwtService.signAsync(payload, {
      secret: adminSecret,
      expiresIn: this.config.get<string>('ADMIN_JWT_EXPIRES_IN', '8h'),
    });
    const expiresAt = Date.now() + this.parseExpiresMs();

    return {
      token,
      expiresAt,
      user: this.toAdminUser(user, roleIds, roleCodes),
      permissions,
      mustChangePassword: user.mustChangePassword,
      refreshToken: newRefreshToken,
    };
  }

  /** 签发管理端 refresh token（Redis 存储，7 天有效） */
  private async generateAdminRefreshToken(userId: number): Promise<string> {
    const refreshToken = randomUUID();
    await this.redis.set(ADMIN_REFRESH_TOKEN_PREFIX + refreshToken, String(userId), 7 * 24 * 3600);
    return refreshToken;
  }

  /** 校验管理端 refresh token，返回 userId（无效/过期返回 null） */
  private async verifyAdminRefreshToken(refreshToken: string): Promise<number | null> {
    try {
      const raw = await this.redis.get(ADMIN_REFRESH_TOKEN_PREFIX + refreshToken);
      if (!raw) return null;
      const userId = Number(raw);
      return Number.isInteger(userId) && userId > 0 ? userId : null;
    } catch {
      return null;
    }
  }

  /** 撤销管理端 refresh token */
  private async revokeAdminRefreshToken(refreshToken: string): Promise<void> {
    try {
      await this.redis.del(ADMIN_REFRESH_TOKEN_PREFIX + refreshToken);
    } catch {
      // 忽略撤销失败（Redis 不可用时不阻断登出）
    }
  }

  /** 解析 ADMIN_JWT_EXPIRES_IN（如 '8h'）为毫秒 */
  private parseExpiresMs(): number {
    const ttl = this.config.get<string>('ADMIN_JWT_EXPIRES_IN', '8h');
    const match = ttl.match(/^(\d+)([smhd])?$/);
    if (!match) return 8 * 3600 * 1000;
    const num = parseInt(match[1], 10);
    const unit = match[2] || 's';
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 3600 * 1000,
      d: 86400 * 1000,
    };
    return num * multipliers[unit];
  }
}

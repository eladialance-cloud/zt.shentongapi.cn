import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserEntity } from '../user/entities/user.entity';
import { RoleEntity } from '../user/entities/role.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';

/** 管理端 JWT 载荷 */
export interface AdminTokenPayload {
  userId: number;
  username: string;
  role: 'admin';
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
  ) {}

  /**
   * 管理员登录
   * 校验用户名 + 密码 + 管理员角色，签发 adminToken 并聚合权限。
   */
  async login(username: string, password: string): Promise<AdminLoginResult> {
    // password 字段 select:false，需手动 addSelect
    const user = await this.userRepo
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.username = :username', { username })
      .getOne();
    if (!user) {
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      BusinessException.throw(ErrorCode.INVALID_CREDENTIALS);
    }

    const { roleIds, roleCodes, permissions } = await this.loadAdminIdentity(user.id);
    // 仅允许持有 super_admin / admin 角色的账号登录管理端
    if (!roleCodes.some((c) => c === 'super_admin' || c === 'admin')) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '非管理员账号');
    }

    const payload: AdminTokenPayload = {
      userId: user.id,
      username: user.username,
      role: 'admin',
    };
    const token = await this.jwtService.signAsync(payload);
    const expiresAt = Date.now() + this.parseExpiresMs();

    return {
      token,
      expiresAt,
      user: this.toAdminUser(user, roleIds, roleCodes),
      permissions,
    };
  }

  /**
   * 管理员登出
   * adminToken 无状态，前端清除本地存储即可，后端为空操作。
   */
  async logout(): Promise<void> {
    return;
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

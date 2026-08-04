import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOneOptions } from 'typeorm';
import {
  UserEntity,
  EmailNotificationSettings,
  PushNotificationSettings,
  NotificationSettings,
} from '../entities/user.entity';
import { UserApiKeyEntity } from '../entities/user-api-key.entity';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

/** 通知设置输入（字段均可选，服务端与默认值逐层合并） */
type NotificationSettingsInput = {
  emailNotifications?: Partial<EmailNotificationSettings>;
  pushNotifications?: Partial<PushNotificationSettings>;
};

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity) private roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity) private userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(UserApiKeyEntity) private apiKeyRepo: Repository<UserApiKeyEntity>,
    private encryption: EncryptionService,
  ) {}

  /** 通知设置默认值（全部开启） */
  private readonly DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
    emailNotifications: {
      chatCompleted: true,
      creditsChanged: true,
      systemAnnouncement: true,
    },
    pushNotifications: {
      chatReply: true,
      agentReviewResult: true,
      rechargeArrived: true,
    },
  };

  async findById(id: number): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    return user;
  }

  async findByIdWithPassword(id: number): Promise<UserEntity> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    return user;
  }

  async findByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { username } });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { email } });
  }

  async createUser(dto: CreateUserDto): Promise<UserEntity> {
    // 生成用户自己的邀请码（8 位随机字符串，用于分享给他人）
    const inviteCode = dto.inviteCode || Math.random().toString(36).slice(2, 10).toUpperCase();

    const user = this.userRepo.create({
      username: dto.username,
      email: dto.email,
      password: dto.password, // 已经在外部哈希过
      inviteCode,
      inviterId: dto.inviterId,
      registerSource: dto.registerSource || 'direct',
    });
    const saved = await this.userRepo.save(user);

    // 默认分配 'user' 角色
    const userRole = await this.roleRepo.findOne({ where: { name: 'user' } });
    if (userRole) {
      await this.userRoleRepo.save({
        userId: saved.id,
        roleId: userRole.id,
      });
    }

    return saved;
  }

  async update(id: number, dto: UpdateUserDto): Promise<UserEntity> {
    const user = await this.findById(id);
    
    // 检查唯一字段冲突
    if (dto.username && dto.username !== user.username) {
      const exists = await this.findByUsername(dto.username);
      if (exists) {
        BusinessException.throw(ErrorCode.USER_EXISTS, '用户名已被使用');
      }
    }
    if (dto.email && dto.email !== user.email) {
      const exists = await this.findByEmail(dto.email);
      if (exists) {
        BusinessException.throw(ErrorCode.USER_EXISTS, '邮箱已被使用');
      }
    }
    
    Object.assign(user, dto);
    return this.userRepo.save(user);
  }

  async changePassword(id: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.findByIdWithPassword(id);
    const oldPassword = (dto.oldPassword ?? dto.currentPassword) as string;
    const isMatch = await this.encryption.compare(oldPassword, user.password);
    if (!isMatch) {
      BusinessException.throw(ErrorCode.PASSWORD_INCORRECT);
    }
    user.password = await this.encryption.hash(dto.newPassword);
    await this.userRepo.save(user);
  }

  /**
   * 直接更新密码（用于密码重置，无需旧密码校验）
   * @param id 用户 ID
   * @param hashedPassword 已哈希的新密码
   */
  async updatePassword(id: number, hashedPassword: string): Promise<void> {
    const user = await this.findById(id);
    user.password = hashedPassword;
    await this.userRepo.save(user);
  }

  async updateAvatar(id: number, avatarUrl: string): Promise<UserEntity> {
    const user = await this.findById(id);
    user.avatar = avatarUrl;
    return this.userRepo.save(user);
  }

  async findUserRoles(userId: number): Promise<string[]> {
    const userRoles = await this.userRoleRepo.find({ where: { userId } });
    if (userRoles.length === 0) return [];
    const roleIds = userRoles.map((ur) => ur.roleId);
    const roles = await this.roleRepo.findByIds(roleIds);
    return roles.map((r) => r.name);
  }

  // ===== API Key 管理 =====

  /** 当前用户的 API Key 列表（仅脱敏信息，不含明文） */
  async listApiKeys(userId: number) {
    const keys = await this.apiKeyRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    return keys.map((key) => ({
      id: key.id,
      alias: key.alias,
      maskedKey: `${key.keyPrefix}****`,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt ?? null,
    }));
  }

  /** 创建 API Key：明文仅本次返回，服务端只存哈希 + 前缀 */
  async createApiKey(userId: number, alias: string) {
    const apiKey = this.generateApiKey();
    const entity = this.apiKeyRepo.create({
      userId,
      alias,
      keyHash: this.hashApiKey(apiKey),
      keyPrefix: apiKey.slice(0, 8),
    });
    const saved = await this.apiKeyRepo.save(entity);
    return {
      id: saved.id,
      alias: saved.alias,
      apiKey,
      createdAt: saved.createdAt,
    };
  }

  /** 删除 API Key（非本人视为不存在，返回 404 语义） */
  async deleteApiKey(userId: number, id: number): Promise<void> {
    const entity = await this.apiKeyRepo.findOne({ where: { id, userId } });
    if (!entity) {
      BusinessException.throw(ErrorCode.NOT_FOUND, 'API Key 不存在或无权操作');
    }
    await this.apiKeyRepo.delete(id);
  }

  // ===== 通知设置 =====

  /** 获取当前用户通知设置（未设置时返回默认值） */
  async getNotificationSettings(userId: number): Promise<NotificationSettings> {
    const user = await this.findById(userId);
    return this.mergeNotificationSettings(user.notificationSettings);
  }

  /** 更新当前用户通知设置（与默认值合并后整体存储） */
  async updateNotificationSettings(
    userId: number,
    dto: NotificationSettingsInput,
  ): Promise<void> {
    const user = await this.findById(userId);
    user.notificationSettings = this.mergeNotificationSettings(dto);
    await this.userRepo.save(user);
  }

  // ===== 私有工具 =====

  /** 生成 sk_ 开头的随机 API Key（32 字节随机数，base64url 编码） */
  private generateApiKey(): string {
    return `sk_${crypto.randomBytes(32).toString('base64url')}`;
  }

  /** 计算 API Key 的 SHA-256 哈希（仅存哈希，不存明文） */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /** 将传入设置与默认值逐层合并，保证返回结构完整 */
  private mergeNotificationSettings(
    settings?: NotificationSettingsInput | null,
  ): NotificationSettings {
    const defaults = this.DEFAULT_NOTIFICATION_SETTINGS;
    const input = settings ?? {};
    return {
      emailNotifications: {
        ...defaults.emailNotifications,
        ...(input.emailNotifications ?? {}),
      },
      pushNotifications: {
        ...defaults.pushNotifications,
        ...(input.pushNotifications ?? {}),
      },
    };
  }

  async paginate(page: number, pageSize: number, keyword?: string) {
    const where = keyword
      ? [{ username: Like(`%${keyword}%`) }, { email: Like(`%${keyword}%`) }]
      : {};
    const [list, total] = await this.userRepo.findAndCount({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      order: { createdAt: 'DESC' },
    });
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}

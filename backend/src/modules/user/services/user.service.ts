import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOneOptions } from 'typeorm';
import { UserEntity } from '../entities/user.entity';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { EncryptionService } from '../../../common/services/encryption.service';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity) private userRepo: Repository<UserEntity>,
    @InjectRepository(RoleEntity) private roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity) private userRoleRepo: Repository<UserRoleEntity>,
    private encryption: EncryptionService,
  ) {}

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
    const isMatch = await this.encryption.compare(dto.oldPassword, user.password);
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

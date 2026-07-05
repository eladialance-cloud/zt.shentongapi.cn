import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from '../user/entities/role.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';

/**
 * 管理端角色服务
 * 数据合同真源：Task 17 - 管理端认证与权限
 */
@Injectable()
export class AdminRoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private roleRepo: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private userRoleRepo: Repository<UserRoleEntity>,
  ) {}

  /** 角色列表（含关联用户数） */
  async listRoles() {
    const roles = await this.roleRepo.find({ order: { createdAt: 'DESC' } });
    if (roles.length === 0) return [];

    const roleIds = roles.map((r) => r.id);
    // 一次性聚合每个角色的用户数
    const rows = await this.userRoleRepo
      .createQueryBuilder('ur')
      .select('ur.role_id', 'roleId')
      .addSelect('COUNT(*)', 'cnt')
      .where('ur.role_id IN (:...roleIds)', { roleIds })
      .groupBy('ur.role_id')
      .getRawMany<{ roleId: string; cnt: string }>();
    const countMap = new Map<number, number>(
      rows.map((r) => [Number(r.roleId), Number(r.cnt)]),
    );

    return roles.map((r) => this.toAdminRole(r, countMap.get(r.id) || 0));
  }

  /** 更新角色权限 */
  async updatePermissions(id: number, permissionCodes: string[]) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) {
      return null;
    }
    role.permissions = permissionCodes;
    await this.roleRepo.save(role);
    return this.toAdminRole(role, 0);
  }

  private toAdminRole(role: RoleEntity, userCount: number) {
    const permissions = role.permissions;
    const permissionCodes = Array.isArray(permissions)
      ? permissions.map(String)
      : [];
    return {
      id: role.id,
      name: role.name,
      code: role.code || '',
      permissionCodes,
      userCount,
      description: role.description,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }
}

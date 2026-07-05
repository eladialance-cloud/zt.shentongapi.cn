import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/app.constant';

/**
 * 角色装饰器：标记接口所需角色
 * 数据合同真源：spec.md - JWT 认证机制
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../constants/app.constant';

/**
 * 标记接口为公开接口，跳过 JwtAuthGuard
 * 数据合同真源：spec.md - JWT 认证机制
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

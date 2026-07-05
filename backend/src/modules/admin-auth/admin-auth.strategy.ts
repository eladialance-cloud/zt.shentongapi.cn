import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** 管理端 JWT 载荷 */
export interface AdminJwtPayload {
  userId: number;
  username: string;
  role: 'admin';
}

/**
 * 管理端 JWT 策略（PassStrategy name='admin-jwt'）
 * 数据合同真源：Task 17 - 管理端认证与权限
 * 使用独立的 ADMIN_JWT_SECRET，从 Bearer token 解析。
 * 当前 AdminGuard 直接通过 JwtService.verify 校验，本策略作为标准 Passport 实现
 * 供需要时切换使用，validate 返回 adminUser。
 */
@Injectable()
export class AdminAuthStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('ADMIN_JWT_SECRET'),
    });
  }

  async validate(payload: AdminJwtPayload) {
    return { id: payload.userId, username: payload.username };
  }
}

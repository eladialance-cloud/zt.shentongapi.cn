import { ConfigService } from '@nestjs/config';
import { JwtModuleOptions } from '@nestjs/jwt';

/**
 * JWT 配置
 * 数据合同真源：spec.md - JWT 认证机制
 */
export const jwtConfig = (config: ConfigService): JwtModuleOptions => ({
  secret: config.get<string>('JWT_SECRET'),
  signOptions: {
    expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m'),
  },
});

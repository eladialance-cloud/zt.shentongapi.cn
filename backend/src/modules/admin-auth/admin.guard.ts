import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../common/services/redis.service';
import { ADMIN_TOKEN_BLACKLIST_PREFIX } from './admin-auth.service';

/**
 * 管理端守卫
 * 数据合同真源：Task 17 - 管理端认证与权限
 * 从 Authorization: Bearer <token> 解析 adminToken（使用 ADMIN_JWT_SECRET 校验），
 * 校验通过后将 { id, username } 注入 req.adminUser，供后续控制器/拦截器使用。
 *
 * 注意：本守卫依赖 AdminAuthModule 内注册的 JwtService（独立 admin secret），
 * 因此 AdminGuard 必须由 AdminAuthModule 提供/导出，供其它 admin 模块复用。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const auth: string = request.headers?.authorization || '';
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw new UnauthorizedException('未授权');
    }
    try {
      const adminSecret = this.config.get<string>('ADMIN_JWT_SECRET');
      if (!adminSecret) {
        throw new UnauthorizedException('管理端密钥未配置');
      }
      const payload = await this.jwtService.verifyAsync<{
        userId: number;
        username: string;
        jti?: string;
      }>(match[1], { secret: adminSecret });
      // P0-6: 校验 token 是否已登出（黑名单）。Redis 不可用时降级放行，避免阻断管理端。
      if (payload.jti) {
        try {
          const blacklisted = await this.redis.get(ADMIN_TOKEN_BLACKLIST_PREFIX + payload.jti);
          if (blacklisted) {
            throw new UnauthorizedException('管理端令牌已登出，请重新登录');
          }
        } catch (err) {
          if (err instanceof UnauthorizedException) throw err;
        }
      }
      request.adminUser = { id: payload.userId, username: payload.username };
      return true;
    } catch {
      throw new UnauthorizedException('管理端令牌无效或已过期');
    }
  }
}
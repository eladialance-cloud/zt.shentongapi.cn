import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/services/redis.service';
import { REDIS_REFRESH_TOKEN_PREFIX } from '../../../common/constants/app.constant';
import { JwtPayload } from '../strategies/jwt.strategy';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
    private redis: RedisService,
  ) {}

  async generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string> {
    return this.jwtService.signAsync({
      sub: payload.sub,
      username: payload.username,
      email: payload.email,
      roles: payload.roles,
    });
  }

  async generateRefreshToken(userId: number): Promise<string> {
    const refreshToken = uuidv4();
    const ttl = this.parseTtl(this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'));
    await this.redis.set(`${REDIS_REFRESH_TOKEN_PREFIX}${refreshToken}`, String(userId), ttl);
    return refreshToken;
  }

  async verifyRefreshToken(refreshToken: string): Promise<number | null> {
    const userId = await this.redis.get(`${REDIS_REFRESH_TOKEN_PREFIX}${refreshToken}`);
    return userId ? Number(userId) : null;
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    await this.redis.del(`${REDIS_REFRESH_TOKEN_PREFIX}${refreshToken}`);
  }

  private parseTtl(ttl: string): number {
    // 支持 '15m'、'7d'、'3600' 等格式
    const match = ttl.match(/^(\d+)([smhd])?$/);
    if (!match) return 7 * 24 * 3600;
    const num = parseInt(match[1], 10);
    const unit = match[2] || 's';
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return num * multipliers[unit];
  }
}

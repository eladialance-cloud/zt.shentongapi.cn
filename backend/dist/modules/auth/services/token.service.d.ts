import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/services/redis.service';
import { JwtPayload } from '../strategies/jwt.strategy';
export declare class TokenService {
    private jwtService;
    private config;
    private redis;
    constructor(jwtService: JwtService, config: ConfigService, redis: RedisService);
    generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): Promise<string>;
    generateRefreshToken(userId: number): Promise<string>;
    verifyRefreshToken(refreshToken: string): Promise<number | null>;
    revokeRefreshToken(refreshToken: string): Promise<void>;
    private parseTtl;
}

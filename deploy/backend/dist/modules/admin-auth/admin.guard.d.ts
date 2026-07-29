import { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../common/services/redis.service';
export declare class AdminGuard implements CanActivate {
    private jwtService;
    private redisService;
    constructor(jwtService: JwtService, redisService: RedisService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}

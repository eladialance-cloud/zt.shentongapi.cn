import { NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redis.service';
export declare class HmacVerifyMiddleware implements NestMiddleware {
    private redis;
    private config;
    constructor(redis: RedisService, config: ConfigService);
    use(req: Request, res: Response, next: NextFunction): Promise<void>;
    private computeBodyMd5;
    private safeEqual;
    private fail;
}

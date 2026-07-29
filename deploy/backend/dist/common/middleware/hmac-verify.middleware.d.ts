import { NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redis.service';
export declare class HmacVerifyMiddleware implements NestMiddleware {
    private redis;
    private config;
    private reflector;
    private readonly logger;
    constructor(redis: RedisService, config: ConfigService, reflector: Reflector);
    use(req: Request, res: Response, next: NextFunction): Promise<void>;
    private isHmacRequired;
    private computeBodyMd5;
    private safeEqual;
    private fail;
}

import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
export declare class RedisService implements OnModuleInit {
    private config;
    private client;
    constructor(config: ConfigService);
    onModuleInit(): void;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
    saddIfAbsent(key: string, member: string, ttlSeconds: number): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<void>;
    getClient(): Redis;
}

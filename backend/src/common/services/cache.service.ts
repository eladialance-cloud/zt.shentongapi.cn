import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * 缓存服务：基于 RedisService 实现更高层 JSON 缓存
 * 数据合同真源：spec.md - 配置管理
 */
@Injectable()
export class CacheService {
  constructor(private redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

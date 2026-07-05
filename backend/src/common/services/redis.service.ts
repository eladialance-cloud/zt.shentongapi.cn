import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 服务：封装 ioredis 常用操作
 * 数据合同真源：spec.md - 配置管理 (REDIS_URL)
 */
@Injectable()
export class RedisService implements OnModuleInit {
  private client: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
    );
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * 分布式锁：SET key value EX ttl NX
   * 返回 true 表示加锁成功，false 表示锁已被占用
   * 数据合同真源：Task 29 - 积分数据流（分布式锁）
   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /** SADD + 判断成员是否已存在（用于 nonce 防重放） */
  async saddIfAbsent(key: string, member: string, ttlSeconds: number): Promise<boolean> {
    const added = await this.client.sadd(key, member);
    if (added > 0) {
      await this.client.expire(key, ttlSeconds);
      return true;
    }
    return false;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  getClient(): Redis {
    return this.client;
  }
}

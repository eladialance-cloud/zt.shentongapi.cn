import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 服务：封装 ioredis 常用操作
 * 数据合同真源：spec.md - 配置管理 (REDIS_URL)
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  /** Lua 脚本：原子化锁释放（仅当 key 的值等于传入 value 时才删除） */
  private static readonly RELEASE_LOCK_SCRIPT =
    'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(
      this.config.get<string>('REDIS_URL', 'redis://localhost:6379'),
      {
        retryStrategy: (times: number) => Math.min(times * 100, 3000),
        maxRetriesPerRequest: 3,
        enableOfflineQueue: true,
      },
    );

    this.client.on('error', (err: Error) => {
      this.logger.error(`Redis 连接错误: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis 连接已关闭');
    }
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

  /**
   * 分布式锁原子释放（Lua 脚本）
   * 仅当 key 的值等于 value 时才删除，避免误释放他人持有的锁
   */
  async releaseLock(key: string, value: string): Promise<boolean> {
    const result = await this.client.eval(
      RedisService.RELEASE_LOCK_SCRIPT,
      1,
      key,
      value,
    );
    return Number(result) === 1;
  }

  /** SADD + 判断成员是否已存在（用于 nonce 防重放）
   * 改用独立 key 方案：每个 nonce 单独存为 key 并设置 TTL，避免集合 TTL 被反复重置
   */
  async saddIfAbsent(key: string, member: string, ttlSeconds: number): Promise<boolean> {
    // 使用 SET NX EX 方案：key 存在说明 nonce 已被使用
    const nonceKey = `${key}:${member}`;
    const result = await this.client.set(nonceKey, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  getClient(): Redis {
    return this.client;
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 服务：封装 ioredis 常用操作
 * 数据合同真源：spec.md - 配置管理 (REDIS_URL)
 */
@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(url, {
      retryStrategy: (times: number) => {
        if (times > 10) {
          this.logger.error(`Redis reconnect attempts exhausted (${times} times)`);
          return null;
        }
        const delay = Math.min(times * 200, 2000);
        this.logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`Redis client error: ${err.message}`);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis client connected');
    });

    this.client.on('reconnecting', (delay: number) => {
      this.logger.warn(`Redis client reconnecting in ${delay}ms`);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis client connection closed');
    });
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

  /** SADD + 判断成员是否已存在（用于 nonce 防重放）
   *  使用 Lua 脚本保证 SADD 与 EXPIRE 的原子性
   *  改进：EXPIRE 取 max(当前TTL, 新TTL)，实现滑动窗口续期
   *  防止集合 TTL 在中间过期导致后续 nonce 丢失
   */
  async saddIfAbsent(key: string, member: string, ttlSeconds: number): Promise<boolean> {
    const luaScript = `
      local added = redis.call('SADD', KEYS[1], ARGV[1])
      if added == 1 then
        local currentTtl = redis.call('TTL', KEYS[1])
        local newTtl = tonumber(ARGV[2])
        -- 如果 TTL < 0（key不存在-1无TTL/-2），设置为新TTL；否则取 max
        if currentTtl < 0 then
          redis.call('EXPIRE', KEYS[1], newTtl)
        else
          redis.call('EXPIRE', KEYS[1], math.max(currentTtl, newTtl))
        end
      end
      return added
    `;
    const result = await this.client.eval(
      luaScript,
      1,
      key,
      member,
      String(ttlSeconds),
    );
    return Number(result) === 1;
  }

  /**
   * 分布式锁：原子释放（Lua 脚本 GET+DEL）
   * 仅当 key 的值等于传入的 value 时才删除，避免误删他人锁
   * 返回 true 表示释放成功，false 表示锁已被他人持有或已过期
   */
  async releaseLock(key: string, value: string): Promise<boolean> {
    const luaScript = `
      if redis.call('get', KEYS[1]) == ARGV[1] then
        return redis.call('del', KEYS[1])
      else
        return 0
      end
    `;
    const result = await this.client.eval(luaScript, 1, key, value);
    return Number(result) === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  getClient(): Redis {
    return this.client;
  }
}

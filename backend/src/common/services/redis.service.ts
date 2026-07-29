import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 鏈嶅姟锛氬皝瑁?ioredis 甯哥敤鎿嶄綔
 * 鏁版嵁鍚堝悓鐪熸簮锛歴pec.md - 閰嶇疆绠＄悊 (REDIS_URL)
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
   * 鍒嗗竷寮忛攣锛歋ET key value EX ttl NX
   * 杩斿洖 true 琛ㄧず鍔犻攣鎴愬姛锛宖alse 琛ㄧず閿佸凡琚崰鐢?   * 鏁版嵁鍚堝悓鐪熸簮锛歍ask 29 - 绉垎鏁版嵁娴侊紙鍒嗗竷寮忛攣锛?   */
  async setNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /** SADD + 鍒ゆ柇鎴愬憳鏄惁宸插瓨鍦紙鐢ㄤ簬 nonce 闃查噸鏀撅級
   *  浣跨敤 Lua 鑴氭湰淇濊瘉 SADD 涓?EXPIRE 鐨勫師瀛愭€?   *  鏀硅繘锛欵XPIRE 鍙?max(褰撳墠TTL, 鏂癟TL)锛屽疄鐜版粦鍔ㄧ獥鍙ｇ画鏈?   *  闃叉闆嗗悎 TTL 鍦ㄤ腑闂磋繃鏈熷鑷村悗缁?nonce 涓㈠け
   */
  async saddIfAbsent(key: string, member: string, ttlSeconds: number): Promise<boolean> {
    const luaScript = `
      local added = redis.call('SADD', KEYS[1], ARGV[1])
      if added == 1 then
        local currentTtl = redis.call('TTL', KEYS[1])
        local newTtl = tonumber(ARGV[2])
        -- 濡傛灉 TTL < 0锛坘ey涓嶅瓨鍦?-1鏃燭TL/-2锛夛紝璁剧疆涓烘柊TTL锛涘惁鍒欏彇 max
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
   * 鍒嗗竷寮忛攣锛氬師瀛愰噴鏀撅紙Lua 鑴氭湰 GET+DEL锛?   * 浠呭綋 key 鐨勫€肩瓑浜庝紶鍏ョ殑 value 鏃舵墠鍒犻櫎锛岄伩鍏嶈鍒犱粬浜洪攣
   * 杩斿洖 true 琛ㄧず閲婃斁鎴愬姛锛宖alse 琛ㄧず閿佸凡琚粬浜烘寔鏈夋垨宸茶繃鏈?   */
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

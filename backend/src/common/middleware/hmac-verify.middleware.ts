import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { RedisService } from '../services/redis.service';

/** 时间戳允许的时钟漂移（毫秒） */
const TIMESTAMP_DRIFT_MS = 5 * 60 * 1000;
/** nonce 防重放保留时长（秒） */
const NONCE_TTL_SECONDS = 300;
/** Redis nonce 集合 key */
const NONCE_SET_KEY = 'hmac:nonces';

/**
 * HMAC 验签中间件
 * 数据合同真源：Task 32 - 数据安全设计
 * 校验流程：
 *   1. 提取 X-Timestamp / X-Nonce / X-Signature headers
 *   2. 校验 timestamp 时钟漂移（±5 分钟）
 *   3. HMAC-SHA256(secretKey, `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyMd5}`) 验签
 *   4. Redis nonce 防重放（SADD hmac:nonces，已存在则 NONCE_REPLAYED）
 * 验签失败返回 SIGNATURE_INVALID（HTTP 401）
 *
 * 验签策略：仅在请求携带 X-Signature 时启用严格验签；
 *           未携带则放行（由 JwtAuthGuard 兜底鉴权），等价于 @Public() 跳过公开接口。
 *           全局注册于 JwtAuthGuard 之前（中间件天然先于守卫执行）。
 */
@Injectable()
export class HmacVerifyMiddleware implements NestMiddleware {
  constructor(
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const signature = req.header('x-signature');
    // 未携带签名头：跳过 HMAC 校验，交由后续守卫处理（公开接口/普通 JWT 客户端）
    if (!signature) {
      return next();
    }

    const timestamp = req.header('x-timestamp');
    const nonce = req.header('x-nonce');
    if (!timestamp || !nonce) {
      return this.fail(res, 'SIGNATURE_INVALID', '缺少验签字段');
    }

    // 时钟漂移校验
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_DRIFT_MS) {
      return this.fail(res, 'SIGNATURE_INVALID', '时间戳超出允许漂移范围');
    }

    // nonce 防重放
    const added = await this.redis.saddIfAbsent(NONCE_SET_KEY, nonce, NONCE_TTL_SECONDS);
    if (!added) {
      return this.fail(res, 'NONCE_REPLAYED', '请求已过期或重复');
    }

    // 计算签名
    const secretKey = this.config.get<string>('HMAC_SECRET', 'shentong-ai-hmac-secret');
    const bodyMd5 = this.computeBodyMd5(req);
    const path = req.originalUrl || req.url || '';
    const raw = `${req.method}\n${path}\n${timestamp}\n${nonce}\n${bodyMd5}`;
    const expected = crypto
      .createHmac('sha256', secretKey)
      .update(raw, 'utf8')
      .digest('hex');

    if (!this.safeEqual(expected, signature)) {
      return this.fail(res, 'SIGNATURE_INVALID', '签名校验失败');
    }

    next();
  }

  /** 计算请求体 MD5（优先使用原始 body，回退 JSON 序列化） */
  private computeBodyMd5(req: Request): string {
    const raw = (req as any).rawBody;
    let payload: string;
    if (raw && Buffer.isBuffer(raw)) {
      payload = raw.toString('utf8');
    } else if (req.body && Object.keys(req.body).length > 0) {
      payload = JSON.stringify(req.body);
    } else {
      payload = '';
    }
    return crypto.createHash('md5').update(payload, 'utf8').digest('hex');
  }

  /** 常量时间比较，防时序攻击 */
  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private fail(res: Response, code: string, message: string): void {
    res.status(401).json({
      code,
      data: null,
      message,
      timestamp: Date.now(),
    });
  }
}

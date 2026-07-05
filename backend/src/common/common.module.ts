import { Module } from '@nestjs/common';
import { EncryptionService } from './services/encryption.service';
import { RedisService } from './services/redis.service';
import { CacheService } from './services/cache.service';
import { HmacVerifyMiddleware } from './middleware/hmac-verify.middleware';

/**
 * 公共模块：聚合通用服务提供者
 * 数据合同真源：spec.md - 公共基础设施
 */
@Module({
  providers: [EncryptionService, RedisService, CacheService, HmacVerifyMiddleware],
  exports: [EncryptionService, RedisService, CacheService, HmacVerifyMiddleware],
})
export class CommonModule {}

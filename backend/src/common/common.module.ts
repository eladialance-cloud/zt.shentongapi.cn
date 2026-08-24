import { Module } from '@nestjs/common';
import { EncryptionService } from './services/encryption.service';
import { RedisService } from './services/redis.service';
import { CacheService } from './services/cache.service';
import { HmacVerifyMiddleware } from './middleware/hmac-verify.middleware';
import { VideoFrameService } from './services/video-frame.service';
import { QdrantService } from './services/qdrant.service';

/**
 * 公共模块：聚合通用服务提供者
 * 数据合同真源：spec.md - 公共基础设施
 */
@Module({
  providers: [EncryptionService, RedisService, CacheService, HmacVerifyMiddleware, VideoFrameService, QdrantService],
  exports: [EncryptionService, RedisService, CacheService, HmacVerifyMiddleware, VideoFrameService, QdrantService],
})
export class CommonModule {}

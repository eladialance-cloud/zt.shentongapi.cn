import { ConfigService } from '@nestjs/config';

/**
 * Redis 配置
 * 数据合同真源：spec.md - 配置管理
 */
export const redisConfig = (config: ConfigService) => ({
  type: 'single' as const,
  url: config.get<string>('REDIS_URL') || 'redis://localhost:6379',
});

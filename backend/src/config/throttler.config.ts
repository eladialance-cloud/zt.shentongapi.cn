import { ConfigService } from '@nestjs/config';

/**
 * 限流配置
 * 数据合同真源：spec.md - CORS 与安全 (默认 60 次/分钟)
 */
export const throttlerConfig = (config: ConfigService) => [
  {
    ttl: config.get<number>('THROTTLE_TTL', 60000),
    limit: config.get<number>('THROTTLE_LIMIT', 60),
  },
];

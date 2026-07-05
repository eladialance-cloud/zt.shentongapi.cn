import { ConfigService } from '@nestjs/config';

/**
 * CORS 跨域配置
 * 数据合同真源：spec.md - CORS 与安全
 */
export const corsConfig = (config: ConfigService) => {
  const origins =
    config.get<string>('CORS_ORIGINS') || 'http://localhost:3000';
  return {
    origin: origins.split(','),
    credentials: true,
  };
};

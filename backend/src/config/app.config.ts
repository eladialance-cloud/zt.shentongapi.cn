import { ConfigService } from '@nestjs/config';

/**
 * 应用基础配置
 * 数据合同真源：spec.md - 后端项目可启动
 */
export const appConfig = (config: ConfigService) => ({
  port: config.get<number>('PORT', 3001),
  env: config.get<string>('NODE_ENV', 'development'),
});

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import helmet from 'helmet';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { AppValidationPipe } from './common/pipes/validation.pipe';
import { swaggerConfig } from './config/swagger.config';
import { corsConfig } from './config/cors.config';
import { validateJwtSecrets } from './common/utils/env-validator';
import { runStartupMigrations } from './common/utils/db-migration';
import { DataSource } from 'typeorm';
import * as path from 'path';

/**
 * 应用入口
 */
async function bootstrap() {
  // ===== 启动前校验环境变量（在任何 NestJS 初始化之前执行）=====
  validateJwtSecrets();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

  // 放宽 JSON 请求体限制（OpenClaw 会话上下文 + 工具 schema 可能超过默认 100kb，导致 llm-proxy 413）
  app.useBodyParser('json', { limit: '20mb' });

  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // 全局前缀
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors(corsConfig(configService));

  // Helmet 安全头
  app.use(helmet());

  // 静态托管 uploads（上传文件 / 口播工坊产物），配合前端 resolveMediaUrl 拼 API origin
  // P0-7: 上传文件一律 nosniff；活动内容扩展名强制下载（防同源渲染 XSS）
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res: any, filePath: string) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      const ext = path.extname(filePath).toLowerCase();
      if (['.html', '.htm', '.shtml', '.xhtml', '.svg', '.js', '.mjs', '.cjs', '.xml', '.xsl'].includes(ext)) {
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('Content-Type', 'application/octet-stream');
      }
    },
  });

  // 全局管道
  app.useGlobalPipes(new AppValidationPipe());

  // 全局过滤器
  app.useGlobalFilters(new AllExceptionsFilter());

  // 全局拦截器
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new LoggingInterceptor(),
  );

  // ===== 启动时自动数据库迁移（幂等，补齐缺失列/表）=====
  try {
    const dataSource = app.get(DataSource);
    await runStartupMigrations(dataSource);
  } catch (err) {
    logger.warn(`DB migration skipped: ${(err as Error).message}`);
  }

  // Swagger 文档：生产环境默认关闭（防接口信息泄露），需显式设置 SWAGGER_ENABLED=true 才开启
  const isProduction = process.env.NODE_ENV === 'production';
  const swaggerEnabled = isProduction ? process.env.SWAGGER_ENABLED === 'true' : true;
  let swaggerPath = '';
  if (swaggerEnabled) {
    const setup = swaggerConfig(configService, app);
    swaggerPath = setup.path;
    SwaggerModule.setup(swaggerPath, app, setup.document);
  }

  // 监听端口
  const port = process.env.PORT || configService.get<number>('PORT', 3001);
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}/api`);
  if (swaggerEnabled) {
    logger.log(`Swagger documentation at: http://localhost:${port}/${swaggerPath}`);
  }
}

bootstrap();
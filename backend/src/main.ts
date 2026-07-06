import { NestFactory } from '@nestjs/core';
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

/**
 * 应用入口
 */
async function bootstrap() {
  // ===== 启动前校验环境变量（在任何 NestJS 初始化之前执行）=====
  validateJwtSecrets();

  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // 全局前缀
  app.setGlobalPrefix('api');

  // CORS
  app.enableCors(corsConfig(configService));

  // Helmet 安全头
  app.use(helmet());

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

  // Swagger 文档
  const { path: swaggerPath, document } = swaggerConfig(configService, app);
  SwaggerModule.setup(swaggerPath, app, document);

  // 监听端口
  const port = process.env.PORT || configService.get<number>('PORT', 3001);
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}/api`);
  logger.log(`Swagger documentation at: http://localhost:${port}/${swaggerPath}`);
}

bootstrap();

import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

/**
 * Swagger 文档配置
 * 数据合同真源：spec.md - 后端项目可启动
 */
export interface SwaggerSetupOptions {
  path: string;
  document: OpenAPIObject;
}

export const swaggerConfig = (
  config: ConfigService,
  app: INestApplication,
): SwaggerSetupOptions => {
  const documentConfig = new DocumentBuilder()
    .setTitle('深瞳AI智能中台 API')
    .setDescription('深瞳AI智能中台 - 后端 API 文档')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);
  return {
    path: config.get<string>('SWAGGER_PATH', 'api/docs'),
    document,
  };
};

import { ValidationPipe } from '@nestjs/common';

/**
 * 全局校验管道
 * 数据合同真源：spec.md - 统一 API 响应格式 (校验异常返回 400)
 */
export class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    });
  }
}

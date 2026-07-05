import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * HTTP 日志中间件
 * 数据合同真源：spec.md - 统一 API 响应格式
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const startTime = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      this.logger.log(`${method} ${originalUrl} ${statusCode} ${duration}ms - ${ip}`);
    });

    next();
  }
}

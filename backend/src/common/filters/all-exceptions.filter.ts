import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import { Request, Response } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../constants/error.constant';
import { ApiResponse } from '../types/api-response.type';

/**
 * 全局异常过滤器
 * 数据合同真源：spec.md - 全局异常处理
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let payload: ApiResponse;
    let httpStatus: HttpStatus;

    if (exception instanceof BusinessException) {
      // 业务异常：统一返回 HTTP 200，通过 code 区分
      httpStatus = HttpStatus.OK;
      const res = exception.getResponse() as Record<string, any>;
      payload = {
        code: res.code,
        data: res.data,
        message: res.message,
        timestamp: Date.now(),
      };
    } else if (exception instanceof HttpException) {
      // 其他 HttpException：使用其 status，code 使用 HttpStatus
      httpStatus = exception.getStatus();
      const res = exception.getResponse();
      let message: string;
      let code: number = httpStatus;

      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as Record<string, any>;
        if (Array.isArray(r.message)) {
          // class-validator ValidationError 数组
          message = `参数校验失败: ${r.message.join('; ')}`;
          code = HttpStatus.BAD_REQUEST;
        } else {
          message = r.message || exception.message;
        }
      } else {
        message = exception.message;
      }

      payload = {
        code,
        data: null,
        message,
        timestamp: Date.now(),
      };
    } else if (this.isValidationError(exception)) {
      // 原始 ValidationError 数组
      httpStatus = HttpStatus.BAD_REQUEST;
      const details = (exception as ValidationError[])
        .map((e) => Object.values(e.constraints || {}).join('; '))
        .join('; ');
      payload = {
        code: HttpStatus.BAD_REQUEST,
        data: null,
        message: `参数校验失败: ${details}`,
        timestamp: Date.now(),
      };
    } else {
      // 未知异常：返回 1099 服务器内部错误，并打印 stack
      httpStatus = HttpStatus.OK;
      payload = {
        code: ErrorCode.INTERNAL_ERROR,
        data: null,
        message: '服务器内部错误',
        timestamp: Date.now(),
      };
      this.logger.error(
        `Unhandled exception: ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(httpStatus).json(payload);
  }

  private isValidationError(exception: unknown): exception is ValidationError[] {
    return (
      Array.isArray(exception) &&
      exception.length > 0 &&
      exception.every(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          'constraints' in item,
      )
    );
  }
}

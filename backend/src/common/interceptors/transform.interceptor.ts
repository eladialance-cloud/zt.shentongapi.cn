import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../types/api-response.type';

/**
 * 响应转换拦截器
 * 数据合同真源：spec.md - 统一 API 响应格式
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map(
        (data) =>
          ({
            code: 0,
            data,
            message: 'success',
            timestamp: Date.now(),
          }) as ApiResponse<T>,
      ),
    );
  }
}

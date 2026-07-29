import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError, finalize } from 'rxjs/operators';
import { throwError } from 'rxjs';

/**
 * 日志拦截器：记录请求方法、URL、耗时与状态（成功/失败）
 * 数据合同真源：spec.md - 统一 API 响应格式
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();
    let hasError = false;
    let hasLogged = false;

    return next.handle().pipe(
      tap(() => {
        hasLogged = true;
        const elapsed = Date.now() - now;
        // 成功请求：慢请求用 warn，否则用 log
        if (elapsed > 5000) {
          this.logger.warn(`${method} ${url} - ${elapsed}ms - slow request`);
        } else {
          this.logger.log(`${method} ${url} - ${elapsed}ms - success`);
        }
      }),
      catchError((err) => {
        hasError = true;
        hasLogged = true;
        const errorMsg = err instanceof Error ? err.message : String(err);
        // 失败请求日志
        this.logger.error(
          `${method} ${url} - ${Date.now() - now}ms - failed - ${errorMsg}`,
        );
        return throwError(() => err);
      }),
      finalize(() => {
        // 兜底：如果 tap 和 catchError 都未触发（理论不应发生）
        if (!hasLogged) {
          this.logger.log(`${method} ${url} - ${Date.now() - now}ms - completed`);
        }
      }),
    );
  }
}

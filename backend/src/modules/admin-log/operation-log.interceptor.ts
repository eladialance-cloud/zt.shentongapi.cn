import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AdminLogService } from './admin-log.service';

/**
 * 操作日志拦截器
 * 数据合同真源：Task 17 - 管理端认证与权限
 *
 * 作为 APP_INTERCEPTOR 全局注册，仅对 admin 写操作（POST/PUT/PATCH/DELETE）生效。
 * 通过判断请求路径是否包含 '/admin/' 过滤；从 req.adminUser 取操作人信息，
 * req.ip 取 IP，req.headers['user-agent'] 取 UA，在请求成功后异步写入日志。
 */
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  constructor(private readonly logService: AdminLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method: string = request.method;
    const path: string = request.path || request.url || '';

    if (!path.includes('/admin/')) {
      return next.handle();
    }
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap(() => {
        const adminUser = request.adminUser;
        if (!adminUser) {
          // 未认证的 admin 请求（如登录）不记录
          return;
        }
        const type = this.mapType(method);
        this.logService
          .record({
            userId: adminUser.id,
            username: adminUser.username,
            type,
            target: path,
            operation: `${method} ${path}`,
            ip: request.ip,
            ua: request.headers?.['user-agent'],
          })
          .catch(() => {
            // 忽略日志写入错误
          });
      }),
    );
  }

  /** 将 HTTP 方法映射为前端 OperationType 语义 */
  private mapType(method: string): string {
    switch (method) {
      case 'POST':
        return 'create';
      case 'PUT':
      case 'PATCH':
        return 'update';
      case 'DELETE':
        return 'delete';
      default:
        return 'other';
    }
  }
}

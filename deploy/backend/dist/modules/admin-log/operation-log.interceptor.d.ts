import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AdminLogService } from './admin-log.service';
export declare class OperationLogInterceptor implements NestInterceptor {
    private readonly logService;
    constructor(logService: AdminLogService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
    private mapType;
}

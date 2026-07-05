import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationLogEntity } from './operation-log.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminLogController } from './admin-log.controller';
import { AdminLogService } from './admin-log.service';
import { OperationLogInterceptor } from './operation-log.interceptor';

/**
 * 管理端操作日志模块
 * 数据合同真源：Task 17 - 管理端认证与权限
 *
 * 导入 AdminAuthModule 以复用 AdminGuard；
 * 导出 AdminLogService 供 AppModule 中全局注册的 OperationLogInterceptor 注入。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([OperationLogEntity]),
    AdminAuthModule,
  ],
  controllers: [AdminLogController],
  providers: [AdminLogService, OperationLogInterceptor],
  exports: [AdminLogService],
})
export class AdminLogModule {}

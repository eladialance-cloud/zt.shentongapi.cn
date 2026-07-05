import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { SensitiveWordEntity } from './entities/sensitive-word.entity';
import { AiAuditConfigEntity } from './entities/ai-audit-config.entity';
import { AuditQueueEntity } from './entities/audit-queue.entity';
import { AdminAuditController } from './admin-audit.controller';
import { AdminSensitiveWordController } from './admin-sensitive-word.controller';
import { AdminAuditService } from './admin-audit.service';

/**
 * 管理端内容审核模块
 * 数据合同真源：Task 25 - 内容审核
 *
 * 覆盖前端 admin-audit-api.ts 的全部端点：
 *   - /admin/audit/*          审核队列/AI 配置/审核测试
 *   - /admin/sensitive-words  敏感词管理
 *
 * 导入 AdminAuthModule 以复用 AdminGuard（依赖独立 admin JwtService）。
 * 注意：本模块不在此处注册到 AppModule，由后续任务统一注册。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SensitiveWordEntity,
      AiAuditConfigEntity,
      AuditQueueEntity,
    ]),
    AdminAuthModule,
  ],
  controllers: [AdminAuditController, AdminSensitiveWordController],
  providers: [AdminAuditService],
  exports: [AdminAuditService],
})
export class AdminAuditModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { WorkflowEntity } from './entities/workflow.entity';
import { AdminWorkflowController } from './admin-workflow.controller';
import { AdminWorkflowService } from './admin-workflow.service';

/**
 * 管理端工作流模板模块
 * 数据合同真源：Task 21 - 工作流模板管理
 *
 * 导入 AdminAuthModule 以复用 AdminGuard（依赖独立 admin JwtService）。
 * 注意：本模块不在此处注册到 AppModule，由后续任务统一注册。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowEntity]),
    AdminAuthModule,
  ],
  controllers: [AdminWorkflowController],
  providers: [AdminWorkflowService],
  exports: [AdminWorkflowService],
})
export class AdminWorkflowModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { WorkflowEntity } from './entities/workflow.entity';
import { N8nWorkflowExecLogEntity } from './entities/n8n-workflow-exec-log.entity';
import { WorkflowMcpBindEntity } from './entities/workflow-mcp-bind.entity';
import { AdminWorkflowController } from './admin-workflow.controller';
import { AdminWorkflowService } from './admin-workflow.service';

/**
 * 管理端工作流模板模块（合并版）
 *
 * 合并原 admin-workflow + admin-workflow-lib 两个模块
 * 一张 workflows 表承载：手动CRUD + GitHub导入 + 审核流 + 定价
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WorkflowEntity,
      N8nWorkflowExecLogEntity,
      WorkflowMcpBindEntity,
    ]),
    AdminAuthModule,
  ],
  controllers: [AdminWorkflowController],
  providers: [AdminWorkflowService],
  exports: [AdminWorkflowService],
})
export class AdminWorkflowModule {}

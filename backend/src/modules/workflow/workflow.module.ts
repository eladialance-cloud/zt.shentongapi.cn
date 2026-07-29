import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowController } from './controllers/workflow.controller';
import { WorkflowService } from './services/workflow.service';
import { WorkflowEntity } from '../admin-workflow/entities/workflow.entity';
import { N8nWorkflowExecLogEntity } from '../admin-workflow/entities/n8n-workflow-exec-log.entity';

/**
 * 用户端工作流模块
 *
 * 复用 admin-workflow 模块的 Entity，不自行创建新表。
 * 仅注册本模块所需的 Repository，不依赖 AdminWorkflowModule。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkflowEntity, N8nWorkflowExecLogEntity]),
  ],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}

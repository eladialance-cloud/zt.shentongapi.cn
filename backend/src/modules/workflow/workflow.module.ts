import { Module } from '@nestjs/common';
import { WorkflowController } from './controllers/workflow.controller';
import { WorkflowService } from './services/workflow.service';

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}

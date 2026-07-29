import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { N8nInstanceEntity } from './entities/n8n-instance.entity';
import { N8nWorkflowEntity } from './entities/n8n-workflow.entity';
import { N8nWebhookLogEntity } from './entities/n8n-webhook-log.entity';
import { N8nController } from './controllers/n8n.controller';
import { WorkflowTemplateController } from './controllers/workflow-template.controller';
import { N8nService } from './services/n8n.service';
import { CommonModule } from '../../common/common.module';
import { CreditsModule } from '../credits/credits.module';
import { SyncModule } from '../sync/sync.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      N8nInstanceEntity,
      N8nWorkflowEntity,
      N8nWebhookLogEntity,
    ]),
    CommonModule,
    CreditsModule,
    SyncModule,
  ],
  controllers: [N8nController, WorkflowTemplateController],
  providers: [N8nService],
  exports: [N8nService],
})
export class N8nModule {}

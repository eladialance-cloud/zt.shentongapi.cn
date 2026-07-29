import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { N8nInstanceEntity } from './entities/n8n-instance.entity';
import { N8nWorkflowEntity } from './entities/n8n-workflow.entity';
import { N8nController } from './controllers/n8n.controller';
import { N8nService } from './services/n8n.service';

@Module({
  imports: [TypeOrmModule.forFeature([N8nInstanceEntity, N8nWorkflowEntity])],
  controllers: [N8nController],
  providers: [N8nService],
  exports: [N8nService],
})
export class N8nModule {}

import { Module } from '@nestjs/common';
import { N8nController } from './controllers/n8n.controller';
import { N8nService } from './services/n8n.service';

@Module({
  controllers: [N8nController],
  providers: [N8nService],
  exports: [N8nService],
})
export class N8nModule {}

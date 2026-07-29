import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenClawInstanceEntity } from './entities/openclaw-instance.entity';
import { AgentEntity } from '../agent/entities/agent.entity';
import { OpenClawController } from './controllers/openclaw.controller';
import { OpenClawService } from './services/openclaw.service';
import { CreditsModule } from '../credits/credits.module';
import { SyncModule } from '../sync/sync.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenClawInstanceEntity, AgentEntity]),
    CreditsModule,
    SyncModule,
    forwardRef(() => AgentModule),
  ],
  controllers: [OpenClawController],
  providers: [OpenClawService],
  exports: [OpenClawService],
})
export class OpenClawModule {}

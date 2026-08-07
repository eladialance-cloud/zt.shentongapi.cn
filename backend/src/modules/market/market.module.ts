import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchasedItemEntity } from './entities/purchased-item.entity';
import { HermesSkillEntity } from '../hermes/entities/hermes-skill.entity';
import { PluginEntity } from '../plugin/entities/plugin.entity';
import { WorkflowEntity } from '../admin-workflow/entities/workflow.entity';
import { AgentEntity } from '../agent/entities/agent.entity';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchasedItemEntity,
      HermesSkillEntity,
      PluginEntity,
      WorkflowEntity,
      AgentEntity,
    ]),
    CreditsModule,
  ],
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule {}

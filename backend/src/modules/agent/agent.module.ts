import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentEntity } from './entities/agent.entity';
import { AgentCallLogEntity } from './entities/agent-call-log.entity';
import { AgentFavoriteEntity } from './entities/agent-favorite.entity';
import { AgentRatingEntity } from './entities/agent-rating.entity';
import { AgentReviewEntity } from './entities/agent-review.entity';
import { AgentVersionEntity } from './entities/agent-version.entity';
import { AgentInstallEntity } from './entities/agent-install.entity';
import { WithdrawalRecordEntity } from '../payment/entities/withdrawal-record.entity';
import { AgentController } from './controllers/agent.controller';
import { AgentService } from './services/agent.service';
import { ModelModule } from '../model/model.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentEntity,
      AgentCallLogEntity,
      AgentFavoriteEntity,
      AgentRatingEntity,
      AgentReviewEntity,
      AgentVersionEntity,
      AgentInstallEntity,
      WithdrawalRecordEntity,
    ]),
    ModelModule,
  ],
  controllers: [AgentController],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditAccountEntity } from './entities/credit-account.entity';
import { CreditTransactionEntity } from './entities/credit-transaction.entity';
import { CreditsConfigEntity } from './entities/credits-config.entity';
import { CreditsController, AdminCreditsController } from './controllers/credits.controller';
import { CreditsService } from './services/credits.service';
import { CreditsBillingService } from './services/credits-billing.service';
import { PricingService } from './services/pricing.service';
import { CommonModule } from '../../common/common.module';
import { UserModule } from '../user/user.module';
import { ModelEntity } from '../model/entities/model.entity';
import { AgentEntity } from '../agent/entities/agent.entity';

/**
 * 积分模块
 * 数据合同真源：Task 29 - 积分数据流完整链路
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditAccountEntity,
      CreditTransactionEntity,
      CreditsConfigEntity,
      ModelEntity,
      AgentEntity,
    ]),
    CommonModule,
    UserModule,
  ],
  controllers: [CreditsController, AdminCreditsController],
  providers: [CreditsService, CreditsBillingService, PricingService],
  exports: [CreditsService, CreditsBillingService, PricingService],
})
export class CreditsModule {}

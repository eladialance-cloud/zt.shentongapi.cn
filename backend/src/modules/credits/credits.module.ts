import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditAccountEntity } from './entities/credit-account.entity';
import { CreditTransactionEntity } from './entities/credit-transaction.entity';
import { CreditsConfigEntity } from './entities/credits-config.entity';
import { RechargeOrderEntity } from '../payment/entities/recharge-order.entity';
import { PaymentRecordEntity } from '../payment/entities/payment-record.entity';
import { CreditsController, AdminCreditsController } from './controllers/credits.controller';
import { CreditsService } from './services/credits.service';
import { CreditsBillingService } from './services/credits-billing.service';
import { PricingService } from './services/pricing.service';
import { RechargeService } from './services/recharge.service';
import { CommonModule } from '../../common/common.module';
import { UserModule } from '../user/user.module';
import { PaymentModule } from '../payment/payment.module';
import { ModelEntity } from '../model/entities/model.entity';
import { AgentEntity } from '../agent/entities/agent.entity';

/**
 * 积分模块
 * 数据合同真源：Task 29 - 积分数据流完整链路
 */
@Module({
  imports: [
    forwardRef(() => PaymentModule),
    TypeOrmModule.forFeature([
      CreditAccountEntity,
      CreditTransactionEntity,
      CreditsConfigEntity,
      RechargeOrderEntity,
      PaymentRecordEntity,
      ModelEntity,
      AgentEntity,
    ]),
    CommonModule,
    UserModule,
  ],
  controllers: [CreditsController, AdminCreditsController],
  providers: [CreditsService, CreditsBillingService, PricingService, RechargeService],
  exports: [CreditsService, CreditsBillingService, PricingService, RechargeService],
})
export class CreditsModule {}

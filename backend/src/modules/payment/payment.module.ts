import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipPlanEntity } from './entities/membership-plan.entity';
import { PaymentConfigEntity } from './entities/payment-config.entity';
import { PaymentRecordEntity } from './entities/payment-record.entity';
import { RechargeOrderEntity } from './entities/recharge-order.entity';
import { RechargePlanEntity } from './entities/recharge-plan.entity';
import { RevenueRecordEntity } from './entities/revenue-record.entity';
import { WithdrawalRecordEntity } from './entities/withdrawal-record.entity';
import { PaymentController } from './controllers/payment.controller';
import { PaymentCallbackController } from './controllers/payment-callback.controller';
import { AdminRechargePlanController } from './controllers/admin-recharge-plan.controller';
import { AdminPaymentConfigController } from './controllers/admin-payment-config.controller';
import { CreditsModule } from '../credits/credits.module';
import { PaymentService } from './services/payment.service';
import { RechargePlanService } from './services/recharge-plan.service';
import { PaymentConfigService } from './services/payment-config.service';
import { PaymentGatewayService } from './services/payment-gateway.service';
import { PaymentCallbackService } from './services/payment-callback.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipPlanEntity,
      PaymentConfigEntity,
      PaymentRecordEntity,
      RechargeOrderEntity,
      RechargePlanEntity,
      RevenueRecordEntity,
      WithdrawalRecordEntity,
    ]),
  ],
  controllers: [
    PaymentController,
    AdminRechargePlanController,
    AdminPaymentConfigController,
  ],
  providers: [PaymentService, RechargePlanService, PaymentConfigService],
  exports: [PaymentService, RechargePlanService, PaymentConfigService],
})
export class PaymentModule {}

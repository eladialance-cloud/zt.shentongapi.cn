import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipPlanEntity } from './entities/membership-plan.entity';
import { PaymentConfigEntity } from './entities/payment-config.entity';
import { PaymentRecordEntity } from './entities/payment-record.entity';
import { RechargeOrderEntity } from './entities/recharge-order.entity';
import { RechargePlanEntity } from './entities/recharge-plan.entity';
import { RevenueRecordEntity } from './entities/revenue-record.entity';
import { WithdrawalRecordEntity } from './entities/withdrawal-record.entity';
import { UserMembershipEntity } from './entities/user-membership.entity';
import { RedeemCodeEntity } from './entities/redeem-code.entity';
import { PaymentController } from './controllers/payment.controller';
import { PaymentCallbackController } from './controllers/payment-callback.controller';
import { AdminRechargePlanController } from './controllers/admin-recharge-plan.controller';
import { AdminPaymentConfigController } from './controllers/admin-payment-config.controller';
import { MembershipController } from './controllers/membership.controller';
import { AdminMembershipController } from './controllers/admin-membership.controller';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { CreditsModule } from '../credits/credits.module';
import { PaymentService } from './services/payment.service';
import { RechargePlanService } from './services/recharge-plan.service';
import { PaymentConfigService } from './services/payment-config.service';
import { PaymentGatewayService } from './services/payment-gateway.service';
import { PaymentCallbackService } from './services/payment-callback.service';
import { MembershipService } from './services/membership.service';
import { MembershipGuard } from './guards/membership.guard';

@Module({
  imports: [
    forwardRef(() => CreditsModule),
    AdminAuthModule,
    TypeOrmModule.forFeature([
      MembershipPlanEntity,
      PaymentConfigEntity,
      PaymentRecordEntity,
      RechargeOrderEntity,
      RechargePlanEntity,
      RevenueRecordEntity,
      WithdrawalRecordEntity,
      UserMembershipEntity,
      RedeemCodeEntity,
    ]),
  ],
  controllers: [
    PaymentController,
    AdminRechargePlanController,
    AdminPaymentConfigController,
    PaymentCallbackController,
    MembershipController,
    AdminMembershipController,
  ],
  providers: [PaymentService, RechargePlanService, PaymentConfigService, PaymentGatewayService, PaymentCallbackService, MembershipService, MembershipGuard],
  exports: [PaymentService, RechargePlanService, PaymentConfigService, PaymentGatewayService, MembershipService, MembershipGuard],
})
export class PaymentModule {}

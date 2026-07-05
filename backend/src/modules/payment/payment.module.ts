import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MembershipPlanEntity } from './entities/membership-plan.entity';
import { PaymentRecordEntity } from './entities/payment-record.entity';
import { RechargeOrderEntity } from './entities/recharge-order.entity';
import { RevenueRecordEntity } from './entities/revenue-record.entity';
import { WithdrawalRecordEntity } from './entities/withdrawal-record.entity';
import { PaymentController } from './controllers/payment.controller';
import { PaymentService } from './services/payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipPlanEntity,
      PaymentRecordEntity,
      RechargeOrderEntity,
      RevenueRecordEntity,
      WithdrawalRecordEntity,
    ]),
  ],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}

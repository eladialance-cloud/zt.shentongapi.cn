import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditTransactionEntity } from '../credits/entities/credit-transaction.entity';
import { RechargeOrderEntity } from '../payment/entities/recharge-order.entity';
import { PaymentRecordEntity } from '../payment/entities/payment-record.entity';
import { ReconciliationDiffEntity } from '../reconciliation/entities/reconciliation-diff.entity';
import { UserEntity } from '../user/entities/user.entity';
import { InvoiceEntity } from './entities/invoice.entity';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminFinanceController } from './admin-finance.controller';
import { AdminFinanceService } from './admin-finance.service';

/**
 * 管理端积分财务模块
 * 数据合同真源：Task 24 - 积分财务管理
 *
 * 覆盖前端 admin-finance-api.ts 的全部端点：
 *   - /admin/credits/transactions    积分流水
 *   - /admin/recharge-orders         充值订单 / 退款
 *   - /admin/invoices                发票 / 开具 / 驳回
 *   - /admin/reconciliation          对账差异
 *   - /admin/dashboard               财务仪表盘
 *
 * 导入 AdminAuthModule 以复用 AdminGuard；
 * 复用现有 CreditTransactionEntity / RechargeOrderEntity / PaymentRecordEntity /
 * ReconciliationDiffEntity / UserEntity，仅新增 InvoiceEntity（发票申请表）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreditTransactionEntity,
      RechargeOrderEntity,
      PaymentRecordEntity,
      ReconciliationDiffEntity,
      UserEntity,
      InvoiceEntity,
    ]),
    AdminAuthModule,
  ],
  controllers: [AdminFinanceController],
  providers: [AdminFinanceService],
  exports: [AdminFinanceService],
})
export class AdminFinanceModule {}

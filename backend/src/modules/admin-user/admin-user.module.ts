import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';
import { RoleEntity } from '../user/entities/role.entity';
import { CreditAccountEntity } from '../credits/entities/credit-account.entity';
import { CreditTransactionEntity } from '../credits/entities/credit-transaction.entity';
import { CreditsConfigEntity } from '../credits/entities/credits-config.entity';
import { RechargeOrderEntity } from '../payment/entities/recharge-order.entity';
import { PaymentRecordEntity } from '../payment/entities/payment-record.entity';
import { DeviceEntity } from '../device/entities/device.entity';
import { CreditsModule } from '../credits/credits.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminUserController } from './admin-user.controller';
import { AdminUserLevelController } from './admin-user-level.controller';
import { AdminRechargeOrderController } from './admin-recharge-order.controller';
import { AdminDeviceController } from './admin-device.controller';
import { AdminUserService } from './admin-user.service';

/**
 * 管理端用户模块
 * 数据合同真源：Task 18 - 用户管理
 *
 * 覆盖前端 admin-user-api.ts 的全部端点：
 *   - /admin/users               用户管理
 *   - /admin/user-levels         用户等级配置
 *   - /admin/recharge-orders     充值订单
 *   - /admin/devices             设备管理
 *
 * 导入 AdminAuthModule 以复用 AdminGuard；
 * 导入 CreditsModule 以复用 CreditsService（积分调整）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      UserRoleEntity,
      RoleEntity,
      CreditAccountEntity,
      CreditTransactionEntity,
      CreditsConfigEntity,
      RechargeOrderEntity,
      PaymentRecordEntity,
      DeviceEntity,
    ]),
    CreditsModule,
    AdminAuthModule,
  ],
  controllers: [
    AdminUserController,
    AdminUserLevelController,
    AdminRechargeOrderController,
    AdminDeviceController,
  ],
  providers: [AdminUserService],
  exports: [AdminUserService],
})
export class AdminUserModule {}

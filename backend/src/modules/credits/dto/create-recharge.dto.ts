import { IsIn, IsInt, IsPositive } from 'class-validator';

export type PaymentMethod = 'wechat' | 'alipay' | 'stripe';

/**
 * 创建充值订单 DTO
 * 数据合同真源：desktop/src/types/credits.ts CreateRechargeDto
 */
export class CreateRechargeDto {
  @IsInt()
  @IsPositive()
  planId: number;

  @IsIn(['wechat', 'alipay', 'stripe'])
  paymentMethod: PaymentMethod;
}

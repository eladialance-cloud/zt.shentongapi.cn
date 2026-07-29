import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

/**
 * 创建充值订单 DTO
 * 数据合同真源：Task 30 - 积分充值与支付
 *
 * 校验规则：
 *   - credits 必须 ≥1（防止负数/零积分订单）
 *   - amount 必须 ≥0.01（防止零元/负数金额订单）
 *   - channel 仅允许 wechat/alipay/stripe
 */
export class CreateRechargeDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  packageId?: number;

  @IsNumber()
  @Min(1)
  credits: number;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsIn(['wechat', 'alipay', 'stripe'])
  channel: 'wechat' | 'alipay' | 'stripe';

  @IsOptional()
  @IsString()
  subMethod?: string;
}

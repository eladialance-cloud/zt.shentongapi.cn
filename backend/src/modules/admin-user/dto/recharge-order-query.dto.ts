import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * 充值订单查询参数
 * 数据合同真源：Task 18 - 用户管理
 */
export class RechargeOrderQueryDto {
  @IsOptional()
  @IsString()
  status?: 'pending' | 'paid' | 'failed' | 'refunded';

  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * 充值订单查询 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 */
export class OrderQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'paid', 'failed', 'refunded'])
  status?: string;

  @IsOptional()
  @IsEnum(['wechat', 'alipay', 'stripe', 'other'])
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

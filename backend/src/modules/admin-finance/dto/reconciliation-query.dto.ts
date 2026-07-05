import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

/**
 * 对账差异查询 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 */
export class ReconciliationQueryDto {
  @IsOptional()
  @IsEnum([
    'credit_balance',
    'token_usage',
    'payment',
    'key_pool_deduction',
    'balance_vs_txn',
    'payment_vs_order',
    'apikey_pool_deduction',
  ])
  type?: string;

  @IsOptional()
  @IsEnum(['pending', 'resolved', 'ignored'])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

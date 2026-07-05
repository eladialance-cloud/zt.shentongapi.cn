import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';

/**
 * 发票查询 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 */
export class InvoiceQueryDto {
  @IsOptional()
  @IsEnum(['pending', 'issued', 'rejected'])
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

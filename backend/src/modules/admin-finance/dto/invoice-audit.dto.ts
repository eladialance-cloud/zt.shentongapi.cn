import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 发票审核 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 *
 * action: issue（开具）/ reject（驳回）
 */
export class InvoiceAuditDto {
  @IsEnum(['issue', 'reject'])
  action: 'issue' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  invoiceNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  invoiceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  reason?: string;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * 开具发票 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 */
export class IssueInvoiceDto {
  @IsString()
  @MaxLength(128)
  invoiceNumber: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  invoiceUrl?: string;
}

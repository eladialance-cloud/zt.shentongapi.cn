import { IsString, MaxLength } from 'class-validator';

/**
 * 驳回发票 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 */
export class RejectInvoiceDto {
  @IsString()
  @MaxLength(512)
  reason: string;
}

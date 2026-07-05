import { IsNumber, IsString, MaxLength, Min } from 'class-validator';

/**
 * 手动调整对账差异 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 */
export class AdjustReconciliationDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @MaxLength(512)
  remark: string;
}

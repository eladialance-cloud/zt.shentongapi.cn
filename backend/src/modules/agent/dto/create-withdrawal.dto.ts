import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min } from 'class-validator';

/** 申请提现 DTO（数据合同真源：desktop types/agent-creator CreateWithdrawalDto） */
export class CreateWithdrawalDto {
  @ApiProperty({ description: '提现金额（积分），必须大于 0', minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  amount: number;
}

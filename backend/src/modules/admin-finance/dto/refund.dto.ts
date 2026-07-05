import { IsString, MaxLength } from 'class-validator';

/**
 * 退款请求 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 */
export class RefundDto {
  @IsString()
  @MaxLength(512)
  reason: string;
}

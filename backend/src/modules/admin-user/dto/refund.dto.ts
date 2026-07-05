import { IsString, MaxLength } from 'class-validator';

/**
 * 退款请求
 * 数据合同真源：Task 18 - 用户管理
 */
export class RefundDto {
  @IsString()
  @MaxLength(512)
  reason: string;
}

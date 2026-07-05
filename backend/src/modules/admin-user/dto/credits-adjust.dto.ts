import { IsInt, IsString, MaxLength } from 'class-validator';

/**
 * 积分调整请求
 * 数据合同真源：Task 18 - 用户管理
 */
export class CreditsAdjustDto {
  /** 金额(正负) */
  @IsInt()
  amount: number;

  @IsString()
  @MaxLength(512)
  remark: string;
}

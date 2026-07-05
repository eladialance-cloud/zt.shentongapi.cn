import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * 用户等级配置更新请求
 * 数据合同真源：Task 18 - 用户管理
 * 用于 PUT /admin/user-levels/:level
 */
export class UserLevelConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minCredits?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxConcurrency?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  dailyCallLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyCreditsLimit?: number;
}

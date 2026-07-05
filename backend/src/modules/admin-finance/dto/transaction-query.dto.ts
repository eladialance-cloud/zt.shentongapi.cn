import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * 积分流水查询 DTO
 * 数据合同真源：Task 24 - 积分财务管理
 */
export class TransactionQueryDto {
  @IsOptional()
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsEnum([
    'recharge',
    'consume',
    'freeze',
    'settle',
    'refund',
    'reward',
    'admin_adjust',
  ])
  type?: string;

  @IsOptional()
  @IsEnum([
    'model_call',
    'plugin_call',
    'workflow_call',
    'kb_search',
    'recharge',
    'admin_adjust',
    'signup_reward',
  ])
  source?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

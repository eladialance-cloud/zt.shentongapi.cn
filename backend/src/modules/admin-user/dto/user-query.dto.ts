import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * 管理端用户列表查询参数
 * 数据合同真源：Task 18 - 用户管理
 */
export class UserQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  status?: 'active' | 'banned';

  @IsOptional()
  @IsInt()
  level?: number;

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

import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * 操作日志查询参数
 * 数据合同真源：Task 17 - 管理端认证与权限
 */
export class OperationLogQueryDto {
  @IsOptional()
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsString()
  type?: string;

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

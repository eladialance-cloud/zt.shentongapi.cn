import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * 设备列表查询参数
 * 数据合同真源：Task 18 - 用户管理
 */
export class DeviceQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * 租户列表查询参数 (GET /admin/tenants)
 * 数据合同真源：Task 28 - 系统配置 / frontend listTenants query
 */
export class TenantQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

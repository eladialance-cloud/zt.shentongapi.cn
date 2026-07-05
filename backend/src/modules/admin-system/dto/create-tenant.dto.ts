import { IsInt, IsObject, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 租户配额
 * 数据合同真源：Task 28 - 系统配置 / frontend CreateTenantDto.quota
 */
export class TenantQuotaDto {
  @IsInt()
  @Min(0)
  users: number;

  @IsInt()
  @Min(0)
  calls: number;

  @IsInt()
  @Min(0)
  storage: number;
}

/**
 * 新增租户请求体 (POST /admin/tenants)
 * 数据合同真源：Task 28 - 系统配置 / frontend CreateTenantDto
 */
export class CreateTenantDto {
  @IsString()
  @MaxLength(128)
  name: string;

  @IsObject()
  @Type(() => TenantQuotaDto)
  quota: TenantQuotaDto;
}

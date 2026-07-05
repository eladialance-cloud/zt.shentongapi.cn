import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TenantQuotaDto } from './create-tenant.dto';

/**
 * 更新租户请求体 (PATCH /admin/tenants/:id)
 * 数据合同真源：Task 28 - 系统配置 / frontend UpdateTenantDto
 */
export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsObject()
  @Type(() => TenantQuotaDto)
  quota?: TenantQuotaDto;
}

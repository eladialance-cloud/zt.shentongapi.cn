import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

/**
 * 更新系统配置请求体 (PUT /admin/system/config)
 * 数据合同真源：Task 28 - 系统配置 / frontend UpdateSystemConfigDto
 */
export class UpdateSystemConfigDto {
  @IsIn(['cache', 'rate_limit', 'notification'])
  section: 'cache' | 'rate_limit' | 'notification';

  @IsObject()
  config: Record<string, unknown>;
}

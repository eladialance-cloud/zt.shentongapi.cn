import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

/**
 * 更新公告请求体 (PATCH /admin/announcements/:id)
 * 数据合同真源：Task 28 - 系统配置 / frontend UpdateAnnouncementDto
 */
export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsIn(['info', 'warning', 'critical'])
  type?: 'info' | 'warning' | 'critical';

  @IsOptional()
  @IsIn(['all', 'level_specific'])
  scope?: 'all' | 'level_specific';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  targetLevel?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

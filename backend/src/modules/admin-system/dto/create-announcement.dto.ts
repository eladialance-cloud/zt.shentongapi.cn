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
 * 新增公告请求体 (POST /admin/announcements)
 * 数据合同真源：Task 28 - 系统配置 / frontend CreateAnnouncementDto
 */
export class CreateAnnouncementDto {
  @IsString()
  @MaxLength(128)
  title: string;

  @IsString()
  content: string;

  @IsIn(['info', 'warning', 'critical'])
  type: 'info' | 'warning' | 'critical';

  @IsIn(['all', 'level_specific'])
  scope: 'all' | 'level_specific';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  targetLevel?: number;

  @IsBoolean()
  isActive: boolean;
}

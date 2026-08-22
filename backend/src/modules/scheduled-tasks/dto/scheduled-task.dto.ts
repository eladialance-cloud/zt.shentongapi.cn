import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

/** 创建定时任务 */
export class CreateScheduledTaskDto {
  @ApiProperty({ description: '任务标题', example: '每天早报' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ description: '任务内容（触发时交给 Hermes 执行）', example: '生成一份古诗词鉴赏早报' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '执行团队 ID（缺省自动选用户第一个团队）', example: 1 })
  @IsOptional()
  @IsInt()
  teamId?: number;

  @ApiProperty({ description: '重复类型', enum: ['once', 'daily', 'weekly'], example: 'daily' })
  @IsIn(['once', 'daily', 'weekly'])
  repeatType: 'once' | 'daily' | 'weekly';

  @ApiPropertyOptional({ description: '触发时间 HH:mm（daily/weekly 必填）', example: '09:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'runTime 格式须为 HH:mm' })
  runTime?: string;

  @ApiPropertyOptional({ description: '每周触发星期 1-7（weekly 必填；1=周一）', example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  weekday?: number;

  @ApiPropertyOptional({ description: '一次性任务的执行时间（once 必填；ISO 字符串）', example: '2026-08-23T09:00:00+08:00' })
  @IsOptional()
  @IsString()
  dueAt?: string;
}

/** 更新定时任务（全部可选） */
export class UpdateScheduledTaskDto {
  @ApiPropertyOptional({ description: '任务标题' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: '任务内容' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '执行团队 ID' })
  @IsOptional()
  @IsInt()
  teamId?: number;

  @ApiPropertyOptional({ description: '重复类型', enum: ['once', 'daily', 'weekly'] })
  @IsOptional()
  @IsIn(['once', 'daily', 'weekly'])
  repeatType?: 'once' | 'daily' | 'weekly';

  @ApiPropertyOptional({ description: '触发时间 HH:mm' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'runTime 格式须为 HH:mm' })
  runTime?: string;

  @ApiPropertyOptional({ description: '每周触发星期 1-7' })
  @IsOptional()
  @IsInt()
  @Min(1)
  weekday?: number;

  @ApiPropertyOptional({ description: '一次性任务的执行时间' })
  @IsOptional()
  @IsString()
  dueAt?: string;

  @ApiPropertyOptional({ description: '启用/暂停/恢复', enum: ['active', 'paused'] })
  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: 'active' | 'paused';
}

/** 触发完成回执 */
export class ScheduledTaskFiredDto {
  @ApiPropertyOptional({ description: '本次执行是否成功（失败时记录 lastError 并推进下次）', default: true })
  @IsOptional()
  @IsBoolean()
  success?: boolean;

  @ApiPropertyOptional({ description: '失败原因' })
  @IsOptional()
  @IsString()
  error?: string;
}

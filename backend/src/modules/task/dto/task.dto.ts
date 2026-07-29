import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQuery, PaginatedResult } from '../../../common/types/pagination.type';

/** 任务类型枚举 */
export enum TaskType {
  CHAT = 'chat',
  WORKFLOW = 'workflow',
  SKILL = 'skill',
  MULTI_AGENT = 'multi_agent',
  CODEX = 'codex',
}

/** 任务状态枚举 */
export enum TaskStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** 输出项类型枚举 */
export enum OutputType {
  TEXT = 'text',
  FORM = 'form',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
}

/**
 * 创建任务 DTO
 */
export class CreateTaskDto {
  @ApiProperty({
    description: '任务类型',
    enum: TaskType,
    example: 'chat',
  })
  @IsEnum(TaskType)
  @IsNotEmpty()
  taskType: TaskType;

  @ApiPropertyOptional({ description: '关联的 Agent ID', example: 1 })
  @IsOptional()
  @IsInt()
  agentId?: number;

  @ApiPropertyOptional({ description: '任务标题', maxLength: 256, example: '翻译任务' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  title?: string;

  @ApiPropertyOptional({ description: '输入文本', example: '请帮我翻译这段话' })
  @IsOptional()
  @IsString()
  inputText?: string;

  @ApiPropertyOptional({ description: '输入参数（JSON）', example: { lang: 'en' } })
  @IsOptional()
  @IsObject()
  inputParams?: Record<string, unknown>;
}

/**
 * 更新任务状态 DTO
 */
export class UpdateTaskStatusDto {
  @ApiProperty({
    description: '任务状态',
    enum: TaskStatus,
    example: 'running',
  })
  @IsEnum(TaskStatus)
  @IsNotEmpty()
  status: TaskStatus;

  @ApiPropertyOptional({ description: '错误信息（失败时填写）', example: '执行超时' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({ description: '执行耗时（毫秒）', example: 3500 })
  @IsOptional()
  @IsInt()
  durationMs?: number;
}

/**
 * 创建输出项 DTO
 */
export class CreateOutputItemDto {
  @ApiProperty({
    description: '输出类型',
    enum: OutputType,
    example: 'text',
  })
  @IsEnum(OutputType)
  @IsNotEmpty()
  outputType: OutputType;

  @ApiPropertyOptional({ description: '文本内容', example: '翻译结果...' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ description: 'JSON 内容（表单等结构化数据）', example: { field: 'value' } })
  @IsOptional()
  @IsObject()
  contentJson?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '文件 URL', example: 'https://example.com/file.png' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  fileUrl?: string;

  @ApiPropertyOptional({ description: '文件大小（字节）', example: 102400 })
  @IsOptional()
  @IsInt()
  fileSize?: number;

  @ApiPropertyOptional({ description: 'MIME 类型', example: 'image/png' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  mimeType?: string;

  @ApiPropertyOptional({ description: '元数据', example: { width: 800, height: 600 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * 任务查询 DTO（分页 + 筛选）
 */
export class TaskQueryDto implements PaginationQuery {
  @ApiPropertyOptional({ description: '页码', example: 1 })
  @IsOptional()
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', example: 10 })
  @IsOptional()
  @IsInt()
  pageSize?: number;

  @ApiPropertyOptional({ description: '搜索关键词', example: '翻译' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({ description: '任务类型', enum: TaskType, example: 'chat' })
  @IsOptional()
  @IsEnum(TaskType)
  taskType?: TaskType;

  @ApiPropertyOptional({ description: '任务状态', enum: TaskStatus, example: 'success' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

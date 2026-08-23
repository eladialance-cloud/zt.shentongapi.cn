import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BriefStatus } from '../entities/brief.entity';

/**
 * 创建需求单 DTO
 */
export class CreateBriefDto {
  @ApiProperty({ description: '需求单标题', maxLength: 128, example: '新品上市推广方案' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string;

  @ApiPropertyOptional({ description: '目标描述', example: '提升新品上市首月销量' })
  @IsOptional()
  @IsString()
  goal?: string;

  @ApiPropertyOptional({ description: '目标受众', example: '25-35 岁一线城市白领' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  targetAudience?: string;

  @ApiPropertyOptional({ description: '投放平台', type: [String], example: ['抖音', '小红书'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  platforms?: string[];

  @ApiPropertyOptional({ description: '风格要求', example: '年轻化、高质感' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  style?: string;

  @ApiPropertyOptional({ description: '截止时间', example: '2026-09-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string;

  @ApiPropertyOptional({ description: '来源会话 ID', example: 1001 })
  @IsOptional()
  @IsInt()
  sourceChatSessionId?: number;

  @ApiPropertyOptional({ description: '来源会话摘要', example: '用户描述了新品推广需求' })
  @IsOptional()
  @IsString()
  sourceChatSummary?: string;
}

/**
 * 更新需求单 DTO（全部字段可选）
 */
export class UpdateBriefDto extends PartialType(CreateBriefDto) {}

/**
 * 确认需求单 DTO
 */
export class ConfirmBriefDto {
  @ApiPropertyOptional({ description: '是否手动派发（T3 接线使用）', example: false })
  @IsOptional()
  @IsBoolean()
  manualDispatch?: boolean;

  @ApiPropertyOptional({ description: '指定执行团队 ID（可选；缺省用首个命中角色的成员归属团队）', example: 1 })
  @IsOptional()
  @IsInt()
  teamId?: number;

  @ApiPropertyOptional({ description: '执行方式：team=指定团队 auto=Hermes自动匹配 agent=指定单个Agent', example: 'team' })
  @IsOptional()
  @IsIn(['team', 'auto', 'agent'])
  executeMode?: 'team' | 'auto' | 'agent';

  @ApiPropertyOptional({ description: '指定单个 Agent ID（executeMode=agent 时使用）', example: 1 })
  @IsOptional()
  @IsInt()
  agentId?: number;
}

/**
 * 需求单列表查询 DTO（分页 + 状态过滤）
 */
export class BriefQueryDto {
  @ApiPropertyOptional({ description: '页码', example: 1 })
  @IsOptional()
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ description: '每页条数（上限 100）', example: 10 })
  @IsOptional()
  @IsInt()
  pageSize?: number;

  @ApiPropertyOptional({
    description: '状态筛选',
    enum: ['draft', 'confirmed', 'executing', 'completed', 'cancelled'],
    example: 'draft',
  })
  @IsOptional()
  @IsIn(['draft', 'confirmed', 'executing', 'completed', 'cancelled'])
  status?: BriefStatus;
}
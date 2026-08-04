import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** 创建 Agent DTO（数据合同真源：desktop types/agent-creator CreateAgentDto） */
export class CreateAgentDto {
  @ApiProperty({ description: 'Agent 名称', maxLength: 64 })
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiProperty({ description: '展示名称', maxLength: 64 })
  @IsString()
  @MaxLength(64)
  displayName: string;

  @ApiPropertyOptional({ description: '描述', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional({ description: '头像 URL', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatar?: string;

  @ApiProperty({ enum: ['office', 'programming', 'copywriting', 'data_analysis', 'other'] })
  @IsEnum(['office', 'programming', 'copywriting', 'data_analysis', 'other'])
  category: 'office' | 'programming' | 'copywriting' | 'data_analysis' | 'other';

  @ApiProperty({ description: '系统提示词' })
  @IsString()
  systemPrompt: string;

  @ApiPropertyOptional({ description: '使用示例列表', type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  usageExamples?: string[];

  @ApiProperty({ description: '绑定模型 ID（models.id）' })
  @IsInt()
  @Min(1)
  modelId: number;

  @ApiProperty({ enum: ['per_call', 'per_token'], description: '定价模式' })
  @IsEnum(['per_call', 'per_token'])
  pricingMode: 'per_call' | 'per_token';

  @ApiPropertyOptional({ description: '按次调用定价', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerCall?: number;

  @ApiPropertyOptional({ description: '按 Token 定价-输入', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerTokenInput?: number;

  @ApiPropertyOptional({ description: '按 Token 定价-输出', minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerTokenOutput?: number;
}

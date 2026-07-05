import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 新增 Agent 请求
 * 数据合同真源：Task 20 - Agent 市场管理
 */
export class CreateAgentDto {
  @IsString()
  @MaxLength(64)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  displayName?: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsEnum(['office', 'programming', 'copywriting', 'data_analysis', 'other'])
  category: 'office' | 'programming' | 'copywriting' | 'data_analysis' | 'other';

  @IsOptional()
  @IsArray()
  usageExamples?: string[];

  @IsOptional()
  @IsString()
  modelId?: string;

  @IsOptional()
  @IsObject()
  modelConfig?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsEnum(['perCall', 'perToken'])
  pricingMode: 'perCall' | 'perToken';

  @IsNumber()
  @Min(0)
  pricePerCall: number;

  @IsNumber()
  @Min(0)
  pricePerTokenInput: number;

  @IsNumber()
  @Min(0)
  pricePerTokenOutput: number;
}

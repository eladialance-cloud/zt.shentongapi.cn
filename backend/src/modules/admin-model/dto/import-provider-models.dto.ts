import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 供应商逐模型定价导入项
 * 用户流程：勾选上游模型 -> 逐模型配置最终积分价格(积分/千token) + 模型类型
 */
export class ImportProviderModelItemDto {
  @ApiProperty({ description: '上游模型 ID（实际发送给上游 API 的模型名）', example: 'deepseek-chat' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  upstreamModelId: string;

  @ApiPropertyOptional({ description: '显示名（默认=上游模型 ID）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @ApiPropertyOptional({ description: '分类标签: chat / reasoning / image / embedding 等' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  modelType?: string;

  @ApiPropertyOptional({ description: '最终输入单价(积分/千token)，缺省=0' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  inputPricePer1k?: number;

  @ApiPropertyOptional({ description: '最终输出单价(积分/千token)，缺省=0' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  outputPricePer1k?: number;

  @ApiPropertyOptional({ description: '能力: vision / function_calling / streaming / reasoning / json_mode' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  capabilities?: string[];

  @ApiPropertyOptional({ description: '导入后是否启用，默认 true' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class ImportProviderModelsDto {
  @ApiProperty({ description: '勾选导入的模型（至少 1 个）' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ImportProviderModelItemDto)
  models: ImportProviderModelItemDto[];
}

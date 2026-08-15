import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** 模型市场：批量导入单条（presetKey 必填，其余可覆盖预设默认值） */
export class MarketImportItemDto {
  @ApiProperty({ description: '预设 key（MODEL_TEMPLATES.key）' })
  @IsString()
  @MaxLength(64)
  presetKey: string;

  @ApiPropertyOptional({ description: '显示名（默认用预设名）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @ApiPropertyOptional({ description: '是否上架（默认 false）' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: '场景标签覆盖（默认用预设推荐标签）' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scenarioTags?: string[];

  @ApiPropertyOptional({ description: '积分覆盖，键见 resolvePricing：inputPricePerToken / outputPricePerToken / pricePerImage / pricePerCall / pricePerMinute / videoPerSecond' })
  @IsOptional()
  @IsObject()
  priceOverrides?: Record<string, unknown>;
}

/** 模型市场：批量导入请求体 */
export class MarketImportDto {
  @ApiProperty({ description: '目标供应商 ID' })
  @IsInt()
  @Min(1)
  providerId: number;

  @ApiProperty({ description: '勾选的预设条目（至少 1 个；逐项创建，单项失败不中断）' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarketImportItemDto)
  items: MarketImportItemDto[];
}
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 更新大模型配置 DTO
 * 数据合同真源：Task 23 - 大模型配置
 */
export class UpdateModelDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  modelId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiEndpoint?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  inputPricePerToken?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  outputPricePerToken?: number;

  @IsOptional()
  @IsArray()
  capabilities?: string[];

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  concurrencyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  minUserLevel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  modelType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  upstreamModelId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerImage?: number;

  @IsOptional()
  videoPrices?: Record<string, Record<string, number>>;

  @IsOptional()
  generationParams?: Record<string, unknown>;
}

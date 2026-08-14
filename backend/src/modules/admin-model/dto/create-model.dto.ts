import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * 新增大模型配置 DTO
 * 数据合同真源：Task 23 - 大模型配置
 */
export class CreateModelDto {
  @IsString()
  @MaxLength(64)
  provider: string;

  @IsString()
  @MaxLength(64)
  modelId: string;

  @IsString()
  @MaxLength(128)
  displayName: string;

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

  @IsArray()
  capabilities: string[];

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  concurrencyLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  rateLimitPerMinute?: number;

  @IsInt()
  @Min(1)
  @Max(5)
  minUserLevel: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  providerId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  modelType?: string;
  @IsOptional()
  @IsString()
  @MaxLength(16)
  outputType?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inputTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  advancedCapabilities?: string[];


  @IsOptional()
  @IsString()
  @MaxLength(128)
  upstreamModelId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerCall?: number;

  @IsOptional()
  @IsObject()
  generationParams?: Record<string, unknown>;
  @IsOptional()
  @IsString()
  @MaxLength(32)
  callMode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scenarioTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(16)
  pricingMode?: string;

  @IsOptional()
  @IsObject()
  videoPerSecond?: Record<string, number>;

  @IsOptional()
  @IsObject()
  specs?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  iconUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  remark?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerMinute?: number;
}

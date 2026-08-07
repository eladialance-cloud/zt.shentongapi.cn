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
  @MaxLength(128)
  upstreamModelId?: string;
}

import { IsArray, IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class BatchIdsDto {
  @IsArray()
  @IsInt({ each: true })
  ids: number[];
}

export class BatchEnableDto extends BatchIdsDto {
  @IsBoolean()
  enabled: boolean;
}

export class BatchPriceDto extends BatchIdsDto {
  @IsOptional() @IsNumber() @Min(0) pricePerCall?: number;
  @IsOptional() @IsNumber() @Min(0) pricePerImage?: number;
  @IsOptional() @IsNumber() @Min(0) pricePerMinute?: number;
  @IsOptional() @IsNumber() @Min(0) inputPricePerToken?: number;
  @IsOptional() @IsNumber() @Min(0) outputPricePerToken?: number;
  @IsOptional() @IsObject() videoPerSecond?: Record<string, number>;
}

export class CreateFromTemplateDto {
  @IsString()
  @MaxLength(64)
  templateKey: string;

  @IsOptional() @IsString() @MaxLength(64) modelId?: string;
  @IsOptional() @IsString() @MaxLength(128) displayName?: string;
  @IsOptional() @IsInt() providerId?: number;

  // ===== 模型市场批量创建扩展 =====
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) scenarioTags?: string[];
  @IsOptional() @IsObject() priceOverrides?: Record<string, unknown>;
}

export class ImportModelsJsonDto {
  @IsArray()
  items: Array<Record<string, unknown>>;
}

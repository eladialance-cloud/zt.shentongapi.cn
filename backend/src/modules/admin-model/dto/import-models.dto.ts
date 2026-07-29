import {
  IsArray,
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

class ImportModelItemDto {
  @ApiProperty({ description: '模型 ID' })
  @IsString()
  @IsNotEmpty()
  modelId: string;

  @ApiPropertyOptional({ description: '上游输入价格' })
  @IsOptional()
  @IsNumber()
  upstreamInputPrice?: number;

  @ApiPropertyOptional({ description: '上游输出价格' })
  @IsOptional()
  @IsNumber()
  upstreamOutputPrice?: number;
}

export class ImportModelsDto {
  @ApiProperty({ description: 'API Endpoint' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  apiEndpoint: string;

  @ApiProperty({ description: 'API Key' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  apiKey: string;

  @ApiProperty({ description: '模型列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportModelItemDto)
  models: ImportModelItemDto[];

  @ApiProperty({ description: '加价模式: multiplier / fixed / flat' })
  @IsString()
  @IsNotEmpty()
  pricingMode: string;

  @ApiPropertyOptional({ description: '倍率' })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  multiplier?: number;

  @ApiPropertyOptional({ description: '输入固定加价(积分)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedInputAdd?: number;

  @ApiPropertyOptional({ description: '输出固定加价(积分)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedOutputAdd?: number;

  @ApiPropertyOptional({ description: '统一输入价(积分)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  flatInputPrice?: number;

  @ApiPropertyOptional({ description: '统一输出价(积分)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  flatOutputPrice?: number;
}

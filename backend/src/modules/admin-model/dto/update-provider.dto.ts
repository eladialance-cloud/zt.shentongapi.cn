import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 更新第三方大模型供应商 DTO（字段可选，仅更新传入项）
 */
export class UpdateProviderDto {
  @ApiPropertyOptional({ description: '供应商名称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ description: 'Base URL(OpenAI 兼容)' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'API Key（留空不修改）' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  apiKey?: string;

  @ApiPropertyOptional({ description: '高级配置 JSON' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '供应商状态' })
  @IsOptional()
  @IsEnum(['active', 'disabled'])
  status?: 'active' | 'disabled';

  @ApiPropertyOptional({ description: '是否全局中转（置 true 时自动取消其他供应商）' })
  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;
}

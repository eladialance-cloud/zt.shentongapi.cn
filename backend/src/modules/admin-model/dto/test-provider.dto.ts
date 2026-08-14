import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 供应商连接测试 DTO
 * - 已保存供应商：传 providerId（使用已存 Base URL + Key）
 * - 新增未保存：直接传 baseUrl + apiKey 即时测试
 */
export class TestProviderDto {
  @ApiPropertyOptional({ description: '供应商 ID（已保存时使用）' })
  @IsOptional()
  @IsInt()
  @Min(1)
  providerId?: number;

  @ApiPropertyOptional({ description: 'Base URL(OpenAI 兼容)' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'API Key' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  apiKey?: string;

  @ApiPropertyOptional({ description: '测试用模型名（默认 gpt-3.5-turbo）' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  model?: string;

  @ApiPropertyOptional({ description: '高级配置 JSON（chatPath / modelsPath 等；未保存供应商直测时可用）' })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

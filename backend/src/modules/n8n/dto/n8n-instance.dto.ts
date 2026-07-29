import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsJSON,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateN8nInstanceDto {
  @ApiProperty({ description: '实例名称', example: '生产环境 N8N' })
  @IsString()
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional({ description: '实例描述', example: '用于生产环境的工作流引擎' })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'N8N API 地址', example: 'http://localhost:5678' })
  @IsString()
  @MaxLength(512)
  baseUrl: string;

  @ApiProperty({ description: 'N8N API Key', example: 'n8n_api_xxxxxxxx' })
  @IsString()
  @MaxLength(256)
  apiKey: string;

  @ApiPropertyOptional({ description: 'Webhook URL', example: 'http://localhost:5678/webhook' })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: '额外配置（JSON）', example: '{"timezone":"Asia/Shanghai"}' })
  @IsOptional()
  config?: Record<string, unknown>;
}

export class UpdateN8nInstanceDto {
  @ApiPropertyOptional({ description: '实例名称' })
  @IsString()
  @MaxLength(128)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: '实例描述' })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'N8N API 地址' })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'N8N API Key' })
  @IsString()
  @MaxLength(256)
  @IsOptional()
  apiKey?: string;

  @ApiPropertyOptional({ description: '实例状态', enum: ['pending', 'running', 'stopped', 'error'] })
  @IsIn(['pending', 'running', 'stopped', 'error'])
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ description: 'Webhook URL' })
  @IsString()
  @MaxLength(512)
  @IsOptional()
  webhookUrl?: string;

  @ApiPropertyOptional({ description: '额外配置（JSON）' })
  @IsOptional()
  config?: Record<string, unknown>;
}

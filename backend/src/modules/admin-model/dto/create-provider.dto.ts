import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 新增第三方大模型供应商 DTO
 * 用户流程：名称 + Base URL + API Key -> 测试 -> 读取模型列表 -> 勾选 -> 逐模型定价 -> 导入
 */
export class CreateProviderDto {
  @ApiProperty({ description: '供应商名称', example: 'DeepSeek 中转' })
  @IsString()
  @IsNotEmpty({ message: '供应商名称不能为空' })
  @MaxLength(64)
  name: string;

  @ApiProperty({ description: 'Base URL(OpenAI 兼容)', example: 'https://api.deepseek.com/v1' })
  @IsString()
  @IsNotEmpty({ message: 'Base URL 不能为空' })
  @MaxLength(512)
  baseUrl: string;

  @ApiPropertyOptional({ description: 'API Key', example: 'sk-xxx' })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  apiKey?: string;

  @ApiPropertyOptional({
    description: '高级配置 JSON: headers / timeoutMs / retries / modelsPath 等',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

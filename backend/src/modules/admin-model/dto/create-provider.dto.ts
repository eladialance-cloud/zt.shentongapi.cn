import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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

  @ApiPropertyOptional({ description: '是否全局中转（全站至多 1 条 = true）' })
  @IsOptional()
  @IsBoolean()
  isGlobal?: boolean;

  @ApiPropertyOptional({ description: 'API 风格：openai_compatible / dashscope_native / anthropic / custom' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  apiStyle?: string;

  @ApiPropertyOptional({ description: '每分钟限流（0 = 不限制）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rateLimitPerMinute?: number;

  @ApiPropertyOptional({ description: '并发限制（0 = 不限制）' })
  @IsOptional()
  @IsInt()
  @Min(0)
  concurrencyLimit?: number;

  @ApiPropertyOptional({ description: '余额查询 URL（空字符串表示关闭余额监控）' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  balanceUrl?: string;

  @ApiPropertyOptional({ description: '余额查询请求头（JSON，可含鉴权头）' })
  @IsOptional()
  @IsObject()
  balanceHeaders?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '余额查询附加参数（balancePath / body 等）' })
  @IsOptional()
  @IsObject()
  balanceExtra?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '余额告警阈值（积分，低于该值告警）' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  balanceAlertThreshold?: number;
}

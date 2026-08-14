import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
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

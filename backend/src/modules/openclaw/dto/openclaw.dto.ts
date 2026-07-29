import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterInstanceDto {
  @ApiProperty({ description: '关联的 Agent ID' })
  @IsNumber()
  agentId: number;

  @ApiProperty({ description: 'OpenClaw 侧 agentId' })
  @IsString()
  openclawAgentId: string;

  @ApiPropertyOptional({ description: 'OpenClaw API 地址', default: 'http://localhost:8080' })
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional({ description: '配置（SOUL.md/工具策略/MCP 配置等）' })
  @IsOptional()
  config?: Record<string, unknown>;
}

export class UpdateConfigDto {
  @ApiPropertyOptional({ description: 'OpenClaw API 地址' })
  @IsOptional()
  @IsString()
  endpoint?: string;

  @ApiPropertyOptional({ description: '配置 JSON' })
  @IsOptional()
  config?: Record<string, unknown>;
}

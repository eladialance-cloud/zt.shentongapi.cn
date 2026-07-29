import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 创建 MCP Server DTO
 */
export class CreateMcpServerDto {
  @IsString()
  @MaxLength(128)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsEnum(['stdio', 'http', 'streamable-http'])
  transportType: 'stdio' | 'http' | 'streamable-http';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  command?: string;

  @IsOptional()
  @IsArray()
  args?: string[];

  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  url?: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * 更新 MCP Server DTO
 */
export class UpdateMcpServerDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsEnum(['stdio', 'http', 'streamable-http'])
  transportType?: 'stdio' | 'http' | 'streamable-http';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  command?: string;

  @IsOptional()
  @IsArray()
  args?: string[];

  @IsOptional()
  @IsObject()
  env?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  url?: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * 调用 MCP 工具 DTO
 */
export class CallMcpToolDto {
  @IsString()
  serverId: string;

  @IsString()
  @MaxLength(128)
  toolName: string;

  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}

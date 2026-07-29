import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 创建 MCP 服务配置 DTO
 */
export class CreateServerConfigDto {
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

  @IsEnum(['openclaw', 'codex', 'n8n', 'custom'])
  serviceType: 'openclaw' | 'codex' | 'n8n' | 'custom';
}

/**
 * 更新 MCP 服务配置 DTO
 */
export class UpdateServerConfigDto {
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
  @IsEnum(['openclaw', 'codex', 'n8n', 'custom'])
  serviceType?: 'openclaw' | 'codex' | 'n8n' | 'custom';

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * 创建 MCP 工具注册 DTO
 */
export class CreateToolRegistryDto {
  @IsInt()
  serverId: number;

  @IsString()
  @MaxLength(128)
  toolName: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;
}

/**
 * 更新 MCP 工具注册 DTO
 */
export class UpdateToolRegistryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/**
 * 创建 MCP 资源注册 DTO
 */
export class CreateResourceRegistryDto {
  @IsInt()
  serverId: number;

  @IsString()
  @MaxLength(256)
  resourceUri: string;

  @IsEnum(['agent', 'workflow', 'data', 'file', 'prompt'])
  resourceType: 'agent' | 'workflow' | 'data' | 'file' | 'prompt';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

/**
 * 更新 MCP 资源注册 DTO
 */
export class UpdateResourceRegistryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  resourceUri?: string;

  @IsOptional()
  @IsEnum(['agent', 'workflow', 'data', 'file', 'prompt'])
  resourceType?: 'agent' | 'workflow' | 'data' | 'file' | 'prompt';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/**
 * MCP 通用查询 DTO
 */
export class McpQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsEnum(['openclaw', 'codex', 'n8n', 'custom'])
  serviceType?: 'openclaw' | 'codex' | 'n8n' | 'custom';

  @IsOptional()
  @IsEnum(['pending', 'connected', 'failed', 'disabled'])
  status?: 'pending' | 'connected' | 'failed' | 'disabled';
}

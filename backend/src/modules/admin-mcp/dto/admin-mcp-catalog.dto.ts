import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * MCP 官方目录环境变量模板项 DTO
 */
export class EnvTemplateItemDto {
  @IsString()
  key: string;

  @IsString()
  label: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsBoolean()
  secret?: boolean;

  @IsOptional()
  @IsString()
  default?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * 创建 MCP 官方目录条目 DTO
 */
export class CreateMcpCatalogDto {
  @IsString()
  @MaxLength(128)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  homepage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourceUrl?: string;
  @IsOptional()
  @IsIn(['github', 'manual'])
  sourceType?: 'github' | 'manual';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourceRepo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourcePath?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  githubTopics?: string[];

  @IsOptional()
  @IsObject()
  pricing?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  license?: string;

  @IsEnum(['node', 'python', 'docker', 'http'])
  runtime: 'node' | 'python' | 'docker' | 'http';

  @IsOptional()
  @IsEnum(['official', 'community'])
  securityLevel?: 'official' | 'community';

  @IsEnum(['stdio', 'http', 'streamable-http'])
  transportType: 'stdio' | 'http' | 'streamable-http';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  command?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  args?: string[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EnvTemplateItemDto)
  @IsArray()
  envTemplate?: EnvTemplateItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  url?: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  version?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Min(0)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  toolCount?: number;
}

/**
 * 更新 MCP 官方目录条目 DTO
 */
export class UpdateMcpCatalogDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  homepage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourceUrl?: string;
  @IsOptional()
  @IsIn(['github', 'manual'])
  sourceType?: 'github' | 'manual';

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourceRepo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sourcePath?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  githubTopics?: string[];

  @IsOptional()
  @IsObject()
  pricing?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  license?: string;

  @IsOptional()
  @IsEnum(['node', 'python', 'docker', 'http'])
  runtime?: 'node' | 'python' | 'docker' | 'http';

  @IsOptional()
  @IsEnum(['official', 'community'])
  securityLevel?: 'official' | 'community';

  @IsOptional()
  @IsEnum(['stdio', 'http', 'streamable-http'])
  transportType?: 'stdio' | 'http' | 'streamable-http';

  @IsOptional()
  @IsString()
  @MaxLength(256)
  command?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  args?: string[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EnvTemplateItemDto)
  @IsArray()
  envTemplate?: EnvTemplateItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(512)
  url?: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  version?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Min(0)
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @Min(0)
  @IsInt()
  toolCount?: number;
}

/**
 * MCP 官方目录查询 DTO
 */
export class McpCatalogQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  enabled?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @IsInt()
  pageSize?: number;
}

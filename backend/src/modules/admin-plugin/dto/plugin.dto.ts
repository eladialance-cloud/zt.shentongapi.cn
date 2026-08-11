import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** 插件列表查询参数 */
export class AdminPluginQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** 插件审核队列查询参数 */
export class AdminPluginReviewQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** 插件同步状态查询参数 */
export class PluginSyncQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** 新增插件请求体 */
export class CreateAdminPluginDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsIn(['tool', 'connector', 'knowledge_base', 'workflow'])
  type: string;
  @IsOptional()
  @IsIn(['database', 'search', 'browser', 'git', 'files', 'messaging', 'ai', 'devops', 'other'])
  category?: string;

  @IsOptional()
  @IsIn(['github', 'manual'])
  sourceType?: string;

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

  @IsString()
  version: string;

  @IsOptional()
  @IsString()
  entryPoint?: string;

  @IsOptional()
  @IsObject()
  sandboxConfig?: Record<string, unknown>;

  @IsIn(['perCall', 'perToken'])
  pricingMode: string;

  @IsInt()
  pricePerCall: number;

  @IsInt()
  pricePerTokenInput: number;

  @IsInt()
  pricePerTokenOutput: number;
}

/** 更新插件请求体 */
export class UpdateAdminPluginDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['tool', 'connector', 'knowledge_base', 'workflow'])
  type?: string;
  @IsOptional()
  @IsIn(['database', 'search', 'browser', 'git', 'files', 'messaging', 'ai', 'devops', 'other'])
  category?: string;

  @IsOptional()
  @IsIn(['github', 'manual'])
  sourceType?: string;

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
  version?: string;

  @IsOptional()
  @IsString()
  entryPoint?: string;

  @IsOptional()
  @IsObject()
  sandboxConfig?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['perCall', 'perToken'])
  pricingMode?: string;

  @IsOptional()
  @IsInt()
  pricePerCall?: number;

  @IsOptional()
  @IsInt()
  pricePerTokenInput?: number;

  @IsOptional()
  @IsInt()
  pricePerTokenOutput?: number;
}

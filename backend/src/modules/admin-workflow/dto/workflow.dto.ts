import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  IsBoolean,
} from 'class-validator';

/** 工作流列表查询参数 */
export class AdminWorkflowQueryDto {
  @IsOptional()
  @IsString()
  engineType?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  publishStatus?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** 新增工作流请求体 */
export class CreateAdminWorkflowDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsIn(['n8n', 'coze'])
  engineType: string;

  @IsOptional()
  @IsString()
  n8nWorkflowId?: string;

  @IsOptional()
  @IsString()
  cozeWorkflowId?: string;

  @IsOptional()
  @IsString()
  workflowJson?: string;

  @IsIn(['automation', 'integration', 'data_processing', 'ai_collaboration', 'independent', 'other'])
  category: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown>;

  @IsInt()
  pricePerExecution: number;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  tags?: string[];

  @IsOptional()
  @IsString()
  triggerType?: string;

  @IsOptional()
  @IsInt()
  nodeCount?: number;
}

/** 更新工作流请求体 */
export class UpdateAdminWorkflowDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['n8n', 'coze'])
  engineType?: string;

  @IsOptional()
  @IsString()
  n8nWorkflowId?: string;

  @IsOptional()
  @IsString()
  cozeWorkflowId?: string;

  @IsOptional()
  @IsString()
  workflowJson?: string;

  @IsOptional()
  @IsIn(['automation', 'integration', 'data_processing', 'ai_collaboration', 'independent', 'other'])
  category?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  pricePerExecution?: number;

  @IsOptional()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  tags?: string[];

  @IsOptional()
  @IsIn(['draft', 'pending_review', 'approved', 'published', 'rejected'])
  publishStatus?: string;

  @IsOptional()
  @IsString()
  triggerType?: string;

  @IsOptional()
  @IsInt()
  nodeCount?: number;
}

/** GitHub 导入请求体 */
export class ImportGithubWorkflowDto {
  @IsString()
  repoUrl: string;

  @IsOptional()
  @IsString()
  filePath?: string;

  @IsOptional()
  @IsString()
  category?: string;
}

import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
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
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

/** 审核队列查询参数 */
export class AdminWorkflowReviewQueryDto {
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

  @IsIn(['automation', 'integration', 'data_processing', 'other'])
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
  @IsIn(['automation', 'integration', 'data_processing', 'other'])
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
}

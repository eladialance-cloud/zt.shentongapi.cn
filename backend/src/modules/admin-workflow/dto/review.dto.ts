import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * 审核操作请求体 (POST /admin/workflows/:id/review)
 * 数据合同真源：Task 21 - 工作流模板管理
 */
export class WorkflowReviewDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * 驳回请求体 (POST /admin/workflows/:id/reject)
 */
export class WorkflowRejectDto {
  @IsString()
  reason: string;
}

import {
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

/**
 * 审核队列查询参数 (GET /admin/audit/queue)
 * 数据合同真源：Task 25 - 内容审核 / frontend AuditQueueQuery
 */
export class AuditQueueQueryDto {
  @IsOptional()
  @IsIn(['conversation', 'agent', 'plugin', 'workflow'])
  type?: 'conversation' | 'agent' | 'plugin' | 'workflow';

  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'false_positive'])
  status?: 'pending' | 'approved' | 'rejected' | 'false_positive';

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

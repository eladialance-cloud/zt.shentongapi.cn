import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Agent 审核队列查询参数
 * 数据合同真源：Task 20 - Agent 市场管理
 */
export class AgentReviewQueryDto {
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

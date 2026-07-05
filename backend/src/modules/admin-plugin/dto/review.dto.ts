import { IsIn, IsOptional, IsString } from 'class-validator';

/**
 * 审核操作请求体 (POST /admin/plugins/:id/review)
 * 数据合同真源：Task 22 - 插件管理
 */
export class PluginReviewDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * 驳回请求体 (POST /admin/plugins/:id/reject)
 */
export class PluginRejectDto {
  @IsString()
  reason: string;
}

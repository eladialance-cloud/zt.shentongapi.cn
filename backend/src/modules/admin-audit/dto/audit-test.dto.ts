import { IsString, MaxLength } from 'class-validator';

/**
 * AI 审核测试请求体 (POST /admin/audit/test)
 * 数据合同真源：Task 25 - 内容审核 / frontend AuditTestDto
 */
export class AuditTestDto {
  @IsString()
  @MaxLength(10000)
  text: string;
}

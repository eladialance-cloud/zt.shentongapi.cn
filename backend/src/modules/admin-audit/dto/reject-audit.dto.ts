import { IsString, MaxLength } from 'class-validator';

/**
 * 驳回审核请求体 (POST /admin/audit/:id/reject)
 * 数据合同真源：Task 25 - 内容审核 / frontend RejectAuditDto
 */
export class RejectAuditDto {
  @IsString()
  @MaxLength(512)
  reason: string;
}

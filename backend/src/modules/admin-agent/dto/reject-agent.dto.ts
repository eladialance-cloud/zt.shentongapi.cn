import { IsString, MaxLength } from 'class-validator';

/**
 * 驳回/强制下架请求
 * 数据合同真源：Task 20 - Agent 市场管理
 */
export class RejectAgentDto {
  @IsString()
  @MaxLength(512)
  reason: string;
}

import { IsString, MaxLength } from 'class-validator';

/**
 * 分类显示名更新请求
 * 数据合同真源：Task 20 - Agent 市场管理
 */
export class UpdateCategoryDisplayDto {
  @IsString()
  @MaxLength(64)
  displayName: string;
}

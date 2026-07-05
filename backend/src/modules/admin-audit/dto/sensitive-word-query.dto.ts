import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * 敏感词列表查询参数 (GET /admin/sensitive-words)
 * 数据合同真源：Task 25 - 内容审核 / frontend SensitiveWordQuery
 */
export class SensitiveWordQueryDto {
  @IsOptional()
  @IsIn(['politics', 'porn', 'violence', 'ad', 'other'])
  category?: 'politics' | 'porn' | 'violence' | 'ad' | 'other';

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  pageSize?: number;
}

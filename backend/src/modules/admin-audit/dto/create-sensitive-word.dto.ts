import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * 新增敏感词请求体 (POST /admin/sensitive-words)
 * 数据合同真源：Task 25 - 内容审核 / frontend CreateSensitiveWordDto
 */
export class CreateSensitiveWordDto {
  @IsString()
  @MaxLength(128)
  word: string;

  @IsIn(['politics', 'porn', 'violence', 'ad', 'other'])
  category: 'politics' | 'porn' | 'violence' | 'ad' | 'other';

  @IsIn(['block', 'replace', 'review'])
  level: 'block' | 'replace' | 'review';

  @IsOptional()
  @IsString()
  @MaxLength(128)
  replacement?: string;
}

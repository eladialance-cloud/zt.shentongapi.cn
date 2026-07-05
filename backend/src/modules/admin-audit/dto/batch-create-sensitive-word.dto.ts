import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 批量导入敏感词条目
 * 数据合同真源：Task 25 - 内容审核 / frontend BatchCreateSensitiveWordDto
 */
export class BatchSensitiveWordItemDto {
  @IsString()
  @MaxLength(128)
  word: string;

  @IsIn(['politics', 'porn', 'violence', 'ad', 'other'])
  category: 'politics' | 'porn' | 'violence' | 'ad' | 'other';

  @IsIn(['block', 'replace', 'review'])
  level: 'block' | 'replace' | 'review';
}

/**
 * 批量导入敏感词请求体 (POST /admin/sensitive-words/batch)
 */
export class BatchCreateSensitiveWordDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchSensitiveWordItemDto)
  words: BatchSensitiveWordItemDto[];
}

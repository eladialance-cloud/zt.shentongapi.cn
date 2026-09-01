import { IsString, IsOptional, IsArray, IsNumber, IsObject, Min, Max, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @IsNumber()
  page?: number;

  @ApiPropertyOptional({ description: '每页条数', default: 10 })
  @IsOptional()
  @IsNumber()
  pageSize?: number;
}

export class RateSkillDto {
  @ApiProperty({ description: '评分（1-5）', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: '评论' })
  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateSkillDto {
  @ApiProperty({ description: '技能包名称', maxLength: 128 })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: '作者' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ description: '积分/分钟', default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerMinute?: number;

  @ApiPropertyOptional({ description: '分类' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: '标签' })
  @IsOptional()
  @IsArray()
  tags?: string[];

  @ApiPropertyOptional({ description: '执行配置' })
  @IsOptional()
  @IsObject()
  execConfig?: Record<string, unknown>;
}

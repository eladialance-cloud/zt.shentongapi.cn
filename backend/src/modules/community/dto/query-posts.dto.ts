import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export enum PostSort {
  HOT = 'hot',
  NEW = 'new',
  ESSENCE = 'essence',
}

/**
 * 帖子查询 DTO
 * 数据合同真源：Community 模块 - 帖子列表
 */
export class QueryPostsDto {
  @ApiPropertyOptional({ description: '频道Slug' })
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ enum: PostSort, description: '排序方式' })
  @IsOptional()
  @IsEnum(PostSort)
  sort?: PostSort;

  @ApiPropertyOptional({ description: '页码', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: '每页数量', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

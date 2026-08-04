import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/** 知识库检索 DTO（body: { query, topK }） */
export class SearchKnowledgeDto {
  @ApiProperty({ description: '查询文本' })
  @IsString()
  @IsNotEmpty()
  query: string;

  @ApiProperty({ description: '返回片段数量', required: false, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  topK?: number = 5;
}

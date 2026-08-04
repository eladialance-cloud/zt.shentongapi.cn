import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** 创建 Agent 评价 DTO（数据合同真源：desktop types/agent CreateReviewDto） */
export class CreateReviewDto {
  @ApiProperty({ description: '评分（1-5）', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ description: '评价内容', maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  comment?: string;
}

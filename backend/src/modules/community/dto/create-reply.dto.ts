import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsInt, Min } from 'class-validator';

/**
 * 创建回复 DTO
 * 数据合同真源：Community 模块 - 回复创建
 */
export class CreateReplyDto {
  @ApiProperty({ description: '回复内容（Markdown）' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: '父回复ID（二级回复）' })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  parentId?: number;
}

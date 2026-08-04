import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** 创建知识库 DTO（数据合同真源：desktop/src/types/knowledge.ts CreateKnowledgeBaseDto） */
export class CreateKnowledgeBaseDto {
  @ApiProperty({ description: '知识库名称', maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @ApiProperty({ description: '知识库描述', required: false, maxLength: 512 })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;
}

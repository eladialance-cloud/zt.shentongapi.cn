import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsArray, IsNumber, IsInt, Min, MaxLength, Length, Matches } from 'class-validator';
import { PostType } from '../entities/post.entity';

/**
 * 创建帖子 DTO
 * 数据合同真源：Community 模块 - 帖子创建
 */
export class CreatePostDto {
  @ApiProperty({ description: '频道ID' })
  @IsString()
  @Length(1, 32)
  channelId: string;

  @ApiProperty({ enum: PostType, description: '帖子类型' })
  @IsEnum(PostType)
  type: PostType;

  @ApiProperty({ description: '标题' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: '内容（Markdown）' })
  @IsString()
  content: string;

  @ApiPropertyOptional({ description: '标签名称列表', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '悬赏积分' })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  bounty?: number;

  @ApiPropertyOptional({ description: '封面图片 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImage?: string;

  @ApiPropertyOptional({ description: '演示链接' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Matches(/^https?:\/\//, { message: 'demoUrl 仅允许 http/https 协议' })
  demoUrl?: string;
}

import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ description: '标签名称', example: '高效' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiPropertyOptional({ description: '标签颜色', default: '#6366f1' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;
}

export class UpdateTagDto {
  @ApiPropertyOptional({ description: '标签名称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ description: '标签颜色' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;
}

export class BindTagsDto {
  @ApiProperty({ description: '标签 ID 列表', type: [Number] })
  @IsNotEmpty()
  tagIds: number[];
}

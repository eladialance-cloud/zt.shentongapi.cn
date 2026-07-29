import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiProperty({ description: '部门名称', example: '办公' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiProperty({ description: '部门编码', example: 'office' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(32)
  code: string;

  @ApiPropertyOptional({ description: '图标 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  icon?: string;

  @ApiPropertyOptional({ description: '排序', default: 0 })
  @IsOptional()
  sortOrder?: number;
}

export class UpdateDepartmentDto {
  @ApiPropertyOptional({ description: '部门名称' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @ApiPropertyOptional({ description: '图标 URL' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  icon?: string;

  @ApiPropertyOptional({ description: '排序' })
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ description: '是否启用' })
  @IsOptional()
  isActive?: boolean;
}

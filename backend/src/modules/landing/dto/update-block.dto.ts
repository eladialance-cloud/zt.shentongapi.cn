import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateBlockDto } from './create-block.dto';

/**
 * 更新 Landing 区块请求体 (PUT /admin/landing/blocks/:id)
 * 数据合同真源：Landing 内容管理模块
 */
export class UpdateBlockDto extends PartialType(CreateBlockDto) {
  @ApiPropertyOptional({ description: '是否启用', example: true })
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: '排序权重', example: 10 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

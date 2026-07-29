import { IsString, IsInt, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 排序项 DTO
 * 用于批量更新 Landing 区块排序 (PATCH /admin/landing/blocks/order)
 */
class BlockOrderItemDto {
  @ApiProperty({ description: '区块 ID', example: 'hero_main_001' })
  @IsString()
  id: string;

  @ApiProperty({ description: '排序权重', example: 10 })
  @IsInt()
  sortOrder: number;
}

/**
 * 批量更新 Landing 区块排序请求体
 * 数据合同真源：Landing 内容管理模块
 */
export class UpdateBlockOrderDto {
  @ApiProperty({ description: '排序列表', type: [BlockOrderItemDto] })
  @ArrayMinSize(1)
  orders: BlockOrderItemDto[];
}

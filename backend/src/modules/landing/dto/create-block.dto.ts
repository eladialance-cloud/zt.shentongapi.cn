import {
  IsString,
  MaxLength,
  IsIn,
  IsObject,
  IsOptional,
  IsBoolean,
  IsInt,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 创建 Landing 区块请求体 (POST /admin/landing/blocks)
 * 数据合同真源：Landing 内容管理模块
 */
export class CreateBlockDto {
  @ApiProperty({ description: '区块唯一标识（32位字符串）', example: 'hero_main_001' })
  @IsString()
  @MaxLength(32)
  id: string;

  @ApiProperty({ description: '区块显示名称', example: '首页主横幅' })
  @IsString()
  @MaxLength(64)
  name: string;

  @ApiProperty({
    description: '区块类型',
    enum: ['hero', 'stats', 'cards', 'steps', 'list', 'markdown'],
    example: 'hero',
  })
  @IsIn(['hero', 'stats', 'cards', 'steps', 'list', 'markdown'])
  type: 'hero' | 'stats' | 'cards' | 'steps' | 'list' | 'markdown';

  @ApiProperty({ description: '区块业务数据（JSON 对象）', example: { title: '深瞳 AI' } })
  @IsObject()
  data: Record<string, any>;
}

import { IsIn } from 'class-validator';

/**
 * 清空缓存请求体 (POST /admin/system/cache/clear)
 * 数据合同真源：Task 28 - 系统配置 / frontend ClearCacheDto
 */
export class ClearCacheDto {
  @IsIn(['L1', 'L2', 'L3'])
  layer: 'L1' | 'L2' | 'L3';
}

/**
 * 分页计算工具函数
 * 用于统一分页逻辑，避免 Math.ceil(total / pageSize) 重复出现
 */

export interface PaginationResult {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 计算分页信息
 * @param total 总记录数
 * @param page 当前页码（从 1 开始）
 * @param pageSize 每页条数
 * @returns 分页信息对象
 */
export function calcPagination(
  total: number,
  page: number,
  pageSize: number,
): PaginationResult {
  return {
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 0,
  };
}

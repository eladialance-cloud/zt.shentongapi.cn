import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { PaginationQuery } from '../types/pagination.type';

/**
 * 分页参数装饰器：从 query 提取 page/pageSize/keyword
 * 数据合同真源：spec.md - 统一 API 响应格式
 */
export const Pagination = createParamDecorator(
  (
    data: unknown,
    ctx: ExecutionContext,
  ): Required<Pick<PaginationQuery, 'page' | 'pageSize'>> & {
    keyword?: string;
  } => {
    const request = ctx.switchToHttp().getRequest();
    const { page, pageSize, keyword } = request.query;
    return {
      page: Math.max(1, parseInt(page, 10) || 1),
      pageSize: Math.min(100, Math.max(1, parseInt(pageSize, 10) || 10)),
      keyword: keyword ? String(keyword) : undefined,
    };
  },
);

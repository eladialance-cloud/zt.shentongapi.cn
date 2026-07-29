import { Repository, ObjectLiteral } from 'typeorm';
import { BusinessException } from '../exceptions/business.exception';
import { ErrorCode } from '../constants/error.constant';

/** 解析分页参数，带上下限约束 */
export function parsePaging(page?: number, pageSize?: number, defaultSize = 20) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(100, Math.max(1, Number(pageSize) || defaultSize));
  return { page: p, pageSize: ps };
}

/** 构造分页结果 */
export function paginate<T>(list: T[], total: number, page: number, pageSize: number) {
  return {
    list,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/** 查找实体，不存在则抛 BusinessException */
export async function findOneOrThrow<T extends ObjectLiteral>(
  repo: Repository<T>,
  where: Record<string, unknown>,
  errorCode: ErrorCode = ErrorCode.NOT_FOUND,
  message?: string,
): Promise<T> {
  const entity = await repo.findOne({ where: where as any });
  if (!entity) {
    BusinessException.throw(errorCode, message);
  }
  return entity;
}

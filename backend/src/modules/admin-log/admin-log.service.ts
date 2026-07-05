import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OperationLogEntity } from './operation-log.entity';
import { OperationLogQueryDto } from './dto/operation-log-query.dto';

/**
 * 操作日志服务
 * 数据合同真源：Task 17 - 管理端认证与权限
 */
@Injectable()
export class AdminLogService {
  constructor(
    @InjectRepository(OperationLogEntity)
    private repo: Repository<OperationLogEntity>,
  ) {}

  /** 分页查询操作日志 */
  async list(query: OperationLogQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;

    const qb = this.repo.createQueryBuilder('l');
    if (query.userId) {
      qb.andWhere('l.user_id = :userId', { userId: query.userId });
    }
    if (query.type) {
      qb.andWhere('l.type = :type', { type: query.type });
    }
    if (query.startTime) {
      qb.andWhere('l.created_at >= :start', { start: query.startTime });
    }
    if (query.endTime) {
      qb.andWhere('l.created_at <= :end', { end: query.endTime });
    }
    qb.orderBy('l.created_at', 'DESC');

    const [list, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 记录一条操作日志（fire-and-forget，失败不影响主流程） */
  async record(data: Partial<OperationLogEntity>): Promise<void> {
    try {
      await this.repo.insert(data);
    } catch {
      // 记录失败忽略，避免影响业务主流程
    }
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillPackageEntity } from '../entities/skill-package.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

export interface SkillPackageListQuery {
  page?: number;
  pageSize?: number;
  category?: string;
  skillType?: string;
  keyword?: string;
}

@Injectable()
export class SkillStoreService {
  constructor(
    @InjectRepository(SkillPackageEntity)
    private packageRepo: Repository<SkillPackageEntity>,
  ) {}

  /** 技能商店列表（仅 published） */
  async list(query: SkillPackageListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 12));
    const qb = this.packageRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: 'published' });

    if (query.category) {
      qb.andWhere('p.category = :category', { category: query.category });
    }
    if (query.skillType) {
      qb.andWhere('p.skill_type = :skillType', { skillType: query.skillType });
    }
    if (query.keyword) {
      const escapedKw = query.keyword.replace(/[%_]/g, '\\$&');
      qb.andWhere(
        '(p.display_name LIKE :kw OR p.description LIKE :kw OR p.name LIKE :kw)',
        {
          kw: `%${escapedKw}%`,
        },
      );
    }
    qb.orderBy('p.call_count', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    // 安全脱敏：不返回 installPath/skillMdPath
    const safeList = list.map((p) => this.toSafePackage(p));
    return { list: safeList, total, page, pageSize };
  }

  /** 技能详情（仅 published，安全脱敏） */
  async detail(id: number) {
    const pkg = await this.packageRepo.findOne({
      where: { id, status: 'published' },
    });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '技能不存在或未上架');
    }
    return this.toSafePackage(pkg);
  }

  /** 分类列表 */
  async categories() {
    const result = await this.packageRepo
      .createQueryBuilder('p')
      .select('p.category', 'category')
      .addSelect('COUNT(*)', 'count')
      .where('p.status = :status', { status: 'published' })
      .andWhere('p.category IS NOT NULL')
      .groupBy('p.category')
      .getRawMany();
    return result.map((r) => ({ category: r.category, count: Number(r.count) }));
  }

  /** 调用统计 */
  async stats(id: number) {
    const pkg = await this.packageRepo.findOne({
      where: { id, status: 'published' },
    });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '技能不存在或未上架');
    }
    return {
      callCount: pkg.callCount,
      avgRating: Number(pkg.avgRating),
      version: pkg.version,
      updatedAt: pkg.updatedAt,
    };
  }

  /** 安全脱敏：移除 installPath/skillMdPath */
  private toSafePackage(pkg: SkillPackageEntity) {
    const { installPath, skillMdPath, ...safe } = pkg;
    return safe;
  }
}

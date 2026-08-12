import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkillSourceEntity } from '../entities/skill-source.entity';

/** 技能源查询参数（用户端：仅展示已解析的目录清单条目） */
export interface SkillSourceListQuery {
  page?: number;
  pageSize?: number;
  category?: string;
  keyword?: string;
}

/** 用户端可见的技能源条目（含 GitHub 下载候选） */
export interface UserSkillSource {
  id: number;
  name: string;
  description: string;
  category: string;
  sourceUrl: string;
  repoUrl: string;
  candidates: Array<{ owner: string; repo: string }>;
}

function toUserSource(s: SkillSourceEntity): UserSkillSource {
  const ar = (s.analyzeResult ?? {}) as Record<string, unknown>;
  const candidates = Array.isArray(ar.repoCandidates)
    ? (ar.repoCandidates as Array<{ owner: string; repo: string }>).filter(c => c && c.owner && c.repo)
    : [];
  const repoUrl = typeof ar.repoUrl === 'string' && ar.repoUrl ? ar.repoUrl : '';
  return {
    id: s.id,
    name: s.skillName,
    description: s.skillDesc || '',
    category: s.category || String(ar.category || '其他'),
    sourceUrl: s.sourceUrl,
    repoUrl,
    candidates,
  };
}

/** 技能源（GitHub 技能目录清单）用户端服务 */
@Injectable()
export class SkillSourcesService {
  constructor(
    @InjectRepository(SkillSourceEntity)
    private readonly sourceRepo: Repository<SkillSourceEntity>,
  ) {}

  /** 分页列出已解析技能源（目录清单条目） */
  async list(query: SkillSourceListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const qb = this.sourceRepo.createQueryBuilder('s');
    qb.andWhere('s.status = :status', { status: 'analyzed' });
    if (query.category) {
      qb.andWhere('s.category = :category', { category: query.category });
    }
    if (query.keyword) {
      qb.andWhere('(s.skill_name LIKE :kw OR s.skill_desc LIKE :kw OR s.source_url LIKE :kw)', {
        kw: '%' + query.keyword + '%',
      });
    }
    qb.orderBy('s.id', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return {
      list: list.map(toUserSource),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 技能源全部分类（中文分类，按条目数倒序） */
  async categories() {
    const rows: Array<{ category: string | null; cnt: string }> = await this.sourceRepo
      .createQueryBuilder('s')
      .select('s.category', 'category')
      .addSelect('COUNT(*)', 'cnt')
      .where('s.status = :status', { status: 'analyzed' })
      .andWhere('s.category IS NOT NULL')
      .groupBy('s.category')
      .orderBy('cnt', 'DESC')
      .getRawMany();
    return rows.map(r => ({ category: r.category || '其他', count: Number(r.cnt) || 0 }));
  }
}

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HermesCallLogEntity } from '../entities/hermes-call-log.entity';
import { HermesSkillEntity } from '../entities/hermes-skill.entity';
import { HermesSkillRatingEntity } from '../entities/hermes-skill-rating.entity';
import { TeamService } from '../../team/services/team.service';
import { parsePaging, paginate } from '../../../common/utils/query.util';
import { PaginationDto, RateSkillDto, CreateSkillDto } from '../dto/hermes.dto';
import { HermesReportDto } from '../dto/hermes-report.dto';

@Injectable()
export class HermesService {
  private readonly logger = new Logger(HermesService.name);

  constructor(
    @InjectRepository(HermesCallLogEntity)
    private callLogRepo: Repository<HermesCallLogEntity>,
    @InjectRepository(HermesSkillEntity)
    private skillRepo: Repository<HermesSkillEntity>,
    @InjectRepository(HermesSkillRatingEntity)
    private ratingRepo: Repository<HermesSkillRatingEntity>,
    private teamService: TeamService,
  ) {}
  /**
   * 本地 Hermes 编排结果上报（桌面端主进程回写）
   * 归属校验：团队必须存在且为当前用户创建；写 create_hermes_call_logs（call_type=orchestrate，无实例）
   */
  async reportLocalExecution(userId: number, dto: HermesReportDto) {
    // auto/agent 模式任务无团队归属：跳过团队校验
    if (dto.teamId != null) {
      const { team } = await this.teamService.getTeamDetail(userId, dto.teamId);
      if (!team || Number(team.creatorId) !== userId) {
        throw new NotFoundException('团队不存在');
      }
    }
    const log = this.callLogRepo.create({
      userId,
      instanceId: null,
      teamId: dto.teamId,
      callType: 'orchestrate',
      status: dto.status === 'completed' ? 'success' : 'failed',
      target: dto.executionRef,
      durationMs: dto.durationMs,
      creditsCost: 0,
      errorMessage: dto.error ?? undefined,
    });
    const saved = await this.callLogRepo.save(log);
    return { ok: true, logId: saved.id };
  }

  // ============ 技能市场 ============

  async listMarketSkills(category?: string, search?: string): Promise<HermesSkillEntity[]> {
    const qb = this.skillRepo
      .createQueryBuilder('s')
      .where('s.is_active = :active', { active: true });

    if (category) {
      qb.andWhere('s.category = :category', { category });
    }

    if (search) {
      qb.andWhere('(s.name LIKE :search OR s.description LIKE :search)', {
        search: `%${search}%`,
      });
    }

    qb.orderBy('s.install_count', 'DESC')
      .addOrderBy('s.avg_rating', 'DESC');

    return qb.getMany();
  }

  /** 获取所有分类 */
  async listCategories(): Promise<string[]> {
    const result = await this.skillRepo
      .createQueryBuilder('s')
      .select('DISTINCT s.category', 'category')
      .where('s.is_active = :active', { active: true })
      .andWhere('s.category IS NOT NULL')
      .getRawMany();
    return result.map((r) => r.category).filter(Boolean);
  }

  async listInstalledSkills(userId: number): Promise<HermesSkillEntity[]> {
    // Hermes 实例功能已下线：不再按实例挂载技能包，返回空列表（保留端点兼容旧客户端）
    return [];
  }

  async installSkill(userId: number, skillId: number): Promise<HermesSkillEntity> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能包不存在');
    }
    await this.skillRepo.increment({ id: skillId }, 'installCount', 1);
    return skill;
  }

  /** 卸载技能包（减少安装计数；实例挂载逻辑已随 Hermes 实例功能下线） */
  async uninstallSkill(userId: number, skillId: number): Promise<void> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能包不存在');
    }
    if (skill.installCount > 0) {
      await this.skillRepo.decrement({ id: skillId }, 'installCount', 1);
    }
  }

  /** 评分 */
  async rateSkill(userId: number, skillId: number, dto: RateSkillDto): Promise<HermesSkillEntity> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能包不存在');
    }

    // 查找已有评分（upsert）
    let rating = await this.ratingRepo.findOne({
      where: { userId, skillId },
    });

    if (rating) {
      // 更新评分
      const oldRating = rating.rating;
      rating.rating = dto.rating;
      rating.comment = dto.comment;
      await this.ratingRepo.save(rating);

      // 重新计算平均分
      const totalPoints = skill.avgRating * skill.ratingCount - oldRating + dto.rating;
      skill.avgRating = Math.round((totalPoints / skill.ratingCount) * 100) / 100;
    } else {
      // 新评分
      rating = this.ratingRepo.create({
        userId,
        skillId,
        rating: dto.rating,
        comment: dto.comment,
      });
      await this.ratingRepo.save(rating);

      // 更新平均分
      const totalPoints = skill.avgRating * skill.ratingCount + dto.rating;
      skill.ratingCount += 1;
      skill.avgRating = Math.round((totalPoints / skill.ratingCount) * 100) / 100;
    }

    return this.skillRepo.save(skill);
  }

  /** 获取技能包评分列表 */
  async getSkillRatings(skillId: number, query: PaginationDto) {
    const { page, pageSize } = parsePaging(query.page, query.pageSize, 10);
    const [list, total] = await this.ratingRepo.findAndCount({
      where: { skillId }, order: { createdAt: 'DESC' }, skip: (page - 1) * pageSize, take: Math.min(50, pageSize),
    });
    return paginate(list, total, page, pageSize);
  }

  /** 管理员创建技能包 */
  async createSkill(dto: CreateSkillDto): Promise<HermesSkillEntity> {
    const skill = this.skillRepo.create({
      name: dto.name,
      description: dto.description,
      author: dto.author || '深瞳官方',
      pricePerMinute: dto.pricePerMinute ?? 0,
      category: dto.category,
      tags: dto.tags,
      execConfig: dto.execConfig as any,
      installCount: 0,
      avgRating: 0,
      ratingCount: 0,
      version: '1.0.0',
      isActive: true,
    });
    return this.skillRepo.save(skill);
  }

  /** 检查技能包版本更新（对比版本号） */
  async checkSkillUpdate(skillId: number): Promise<{ hasUpdate: boolean; currentVersion: string; latestVersion: string }> {
    const skill = await this.skillRepo.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new NotFoundException('技能包不存在');
    }
    // TODO: 后续接入远程版本源检测
    return {
      hasUpdate: false,
      currentVersion: skill.version,
      latestVersion: skill.version,
    };
  }


  health() {
    return { status: 'ok', module: 'hermes' };
  }
}

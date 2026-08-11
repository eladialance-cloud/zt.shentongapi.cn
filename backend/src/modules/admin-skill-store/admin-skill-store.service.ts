import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs/promises';
import { SkillSourceEntity } from '../skill-store/entities/skill-source.entity';
import { SkillPackageEntity } from '../skill-store/entities/skill-package.entity';
import { SkillInstallLogEntity } from '../skill-store/entities/skill-install-log.entity';
import { HermesSkillEntity } from '../hermes/entities/hermes-skill.entity';
import { SkillAnalyzerService } from '../skill-store/services/skill-analyzer.service';
import { SkillRunnerService } from '../skill-store/services/skill-runner.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { AiClassifyService } from '../admin-classify/ai-classify.service';
import {
  CreateSkillSourceDto,
  SkillSourceQueryDto,
} from './dto/skill-source.dto';
import { UploadSkillSourceDto } from './dto/upload-skill-source.dto';
import { pickGitHubSourceFields } from '../../common/utils/asset-common';
import * as path from 'path';
import {
  SkillPackageQueryDto,
  UpdateSkillPackageDto,
} from './dto/skill-package.dto';

/**
 * 管理端技能商店服务
 * 数据合同真源：Task 5 - 管理端技能商店
 *
 * 负责技能源提交、技能包编辑、审核与上下架流程管理。
 */
@Injectable()
export class AdminSkillStoreService {
  constructor(
    @InjectRepository(SkillSourceEntity)
    private readonly sourceRepo: Repository<SkillSourceEntity>,
    @InjectRepository(SkillPackageEntity)
    private readonly packageRepo: Repository<SkillPackageEntity>,
    @InjectRepository(HermesSkillEntity)
    private readonly hermesSkillRepo: Repository<HermesSkillEntity>,
    @InjectRepository(SkillInstallLogEntity)
    private readonly installLogRepo: Repository<SkillInstallLogEntity>,
    private readonly analyzerService: SkillAnalyzerService,
    private readonly skillRunnerService: SkillRunnerService,
    @Optional() private readonly aiClassify?: AiClassifyService,
  ) {}

  /** 提交技能源：创建为 pending 状态并落库 */
  async createSource(dto: CreateSkillSourceDto) {
    // 检查 sourceUrl 是否已存在
    const existing = await this.sourceRepo.findOne({ where: { sourceUrl: dto.sourceUrl } });
    if (existing) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '该来源URL已存在');
    }
    const source = new SkillSourceEntity();
    source.sourceUrl = dto.sourceUrl;
    source.sourceType = dto.sourceType;
    source.skillName = dto.skillName;
    source.skillDesc = dto.skillDesc;
    source.skillType = dto.skillType;
    source.status = 'pending';
    return this.sourceRepo.save(source);
  }
  /** 本地上传 zip 技能源：落盘 zip → 创建 pending 来源，由前端触发解析 */
  async createSourceFromZip(file: Express.Multer.File, dto: UploadSkillSourceDto) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '请上传 zip 文件');
    }
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext !== '.zip') {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '仅支持 .zip 压缩包');
    }
    const uploadDir = path.resolve(process.cwd(), 'uploads', 'skills');
    await fs.mkdir(uploadDir, { recursive: true });
    const safeName = (dto.skillName || 'skill').replace(/[^\w.-]/g, '_').slice(0, 32);
    const zipName = `${safeName}-${Date.now()}.zip`;
    const zipPath = path.join(uploadDir, zipName);
    await fs.writeFile(zipPath, file.buffer);

    const source = new SkillSourceEntity();
    source.sourceUrl = `local://${zipPath}`;
    source.sourceType = 'zip';
    source.skillName = dto.skillName;
    source.skillDesc = dto.skillDesc;
    source.skillType = dto.skillType;
    source.status = 'pending';
    return this.sourceRepo.save(source);
  }


  /** 技能源列表（分页，按创建时间倒序） */
  async listSources(query: SkillSourceQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.sourceRepo.createQueryBuilder('s');
    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query.skillType) {
      qb.andWhere('s.skill_type = :skillType', { skillType: query.skillType });
    }
    qb.orderBy('s.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 技能包列表（分页，按创建时间倒序） */
  async listPackages(query: SkillPackageQueryDto) {
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const qb = this.packageRepo.createQueryBuilder('p');
    if (query.status) {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    if (query.skillType) {
      qb.andWhere('p.skill_type = :skillType', { skillType: query.skillType });
    }
    if (query.category) {
      qb.andWhere('p.category = :category', { category: query.category });
    }
    if (query.reviewStatus) {
      qb.andWhere('p.review_status = :reviewStatus', {
        reviewStatus: query.reviewStatus,
      });
    }
    qb.orderBy('p.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 0,
    };
  }

  /** 删除技能源：若已关联技能包则一并删除（含 install_logs + installPath） */
  async removeSource(id: number) {
    const source = await this.sourceRepo.findOne({ where: { id } });
    if (!source) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能源 ${id} 不存在`);
    }
    if (source.packageId) {
      // 1. 删除关联 package 的 install_logs
      await this.installLogRepo.delete({ packageId: source.packageId });

      // 2. 尝试删除关联 package 的 installPath 目录
      const pkg = await this.packageRepo.findOne({ where: { id: source.packageId } });
      if (pkg?.installPath) {
        try {
          await fs.rm(pkg.installPath, { recursive: true, force: true });
        } catch (e) {
          console.warn(`删除 installPath 失败: ${(e as Error).message}`);
        }
      }

      // 3. 删除关联 package
      await this.packageRepo.delete(source.packageId);
    }
    await this.sourceRepo.delete(id);
  }

  /** 技能包详情：返回完整实体（含 installPath/skillMdPath） */
  async packageDetail(id: number) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
    }
    return pkg;
  }

  /** 编辑技能包：Object.assign 覆盖字段后保存 */
  async updatePackage(id: number, dto: UpdateSkillPackageDto) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
    }
    Object.assign(pkg, dto);
    const gh = pickGitHubSourceFields(dto);
    if (dto.sourceType !== undefined) pkg.sourceType = gh.sourceType;
    if (dto.githubTopics !== undefined) pkg.githubTopics = gh.githubTopics;
    if (dto.sourceRepo !== undefined) pkg.sourceRepo = gh.sourceRepo;
    if (dto.sourcePath !== undefined) pkg.sourcePath = gh.sourcePath;
    if (dto.pricing !== undefined) pkg.pricing = gh.pricing;
    const saved = await this.packageRepo.save(pkg);
    if (!pkg.category && this.aiClassify) {
      void this.aiClassify.classifyAndUpdate('skill', saved.id);
    }
  }

  /** 提交审核：仅 draft 状态可提交 */
  async submitReview(id: number) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
    }
    if (pkg.status !== 'draft') {
      BusinessException.throw(ErrorCode.FORBIDDEN, '仅草稿状态可提交审核');
    }
    pkg.status = 'reviewing';
    await this.packageRepo.save(pkg);
  }

  /** 审核通过：置为 approved */
  async approve(id: number) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
    }
    pkg.reviewStatus = 'approved';
    pkg.status = 'approved';
    await this.packageRepo.save(pkg);
  }

  /** 审核驳回：置为 rejected 并记录原因 */
  async reject(id: number, reason: string) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
    }
    pkg.reviewStatus = 'rejected';
    pkg.reviewNote = reason;
    await this.packageRepo.save(pkg);
  }

  /** 上架：仅审核通过的技能包可上架 */
  async publish(id: number) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
    }
    if (pkg.reviewStatus !== 'approved') {
      BusinessException.throw(ErrorCode.FORBIDDEN, '仅审核通过的技能包可上架');
    }
    pkg.status = 'published';
    await this.packageRepo.save(pkg);
    await this.syncSkillToMarket(pkg);
  }

  /** 下架：仅已上架的技能包可下架 */
  async unpublish(id: number) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
    }
    if (pkg.status !== 'published') {
      BusinessException.throw(ErrorCode.FORBIDDEN, '仅已上架的技能包可下架');
    }
    pkg.status = 'unpublished';
    await this.packageRepo.save(pkg);
    await this.hermesSkillRepo.update({ sourcePackageId: id }, { isActive: false });
  }

  /** 删除技能包：删除关联日志、置空来源关联、删除安装目录 */
  async removePackage(id: number) {
    const pkg = await this.packageRepo.findOne({ where: { id } });
    if (!pkg) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能包 ${id} 不存在`);
    }

    // 1. 删除关联的 install_logs
    await this.installLogRepo.delete({ packageId: id });

    // 2. 将关联 SkillSourceEntity.packageId 置空
    const linkedSources = await this.sourceRepo.find({ where: { packageId: id } });
    for (const source of linkedSources) {
      source.packageId = undefined;
      source.status = 'analyzed'; // 保持 analyzed 状态，只是不再关联
      await this.sourceRepo.save(source);
    }

    // 3. 尝试删除 installPath 目录
    if (pkg.installPath) {
      try {
        await fs.rm(pkg.installPath, { recursive: true, force: true });
      } catch (e) {
        // 目录删除失败不阻塞主流程
        console.warn(`删除 installPath 失败: ${(e as Error).message}`);
      }
    }

    // 4. 删除同步到 Hermes 技能市场的记录
    await this.hermesSkillRepo.delete({ sourcePackageId: id });

    // 5. 删除技能包本身
    await this.packageRepo.delete(id);
  }

  /** 批量删除技能包 */
  async batchDeletePackages(ids: number[]) {
    const stats = { total: ids.length, deleted: 0, failed: 0, errors: [] as string[] };
    for (const id of ids) {
      try {
        await this.removePackage(id);
        stats.deleted++;
      } catch (e) {
        stats.failed++;
        stats.errors.push(`技能包 ${id}: ${(e as Error).message}`);
      }
    }
    return stats;
  }

  /** 技能包上架时同步到用户端 Hermes 技能市场（hermes_skills） */
  private async syncSkillToMarket(pkg: SkillPackageEntity) {
    const existing = await this.hermesSkillRepo.findOne({
      where: { sourcePackageId: pkg.id },
    });
    const execConfig = {
      type: 'shell' as const,
      command: pkg.entryPoint || '',
      inputSchema: pkg.inputSchema || undefined,
      outputSchema: pkg.outputSchema || undefined,
      timeoutMs: 60_000,
    };
    const data = {
      name: pkg.displayName || pkg.name,
      description: pkg.description,
      author: '深瞳官方',
      pricePerMinute: 0,
      version: pkg.version || '1.0.0',
      isActive: true,
      category: pkg.category || '其他',
      tags: pkg.triggerKeywords || [],
      execConfig: execConfig as any,
      skillIds: [pkg.id],
      sourceType: pkg.sourceType ?? 'manual',
      sourceRepo: pkg.sourceRepo,
      sourcePath: pkg.sourcePath,
      githubTopics: pkg.githubTopics,
      pricing: pkg.pricing,
      sourcePackageId: pkg.id,
    };
    if (existing) {
      Object.assign(existing, data);
      await this.hermesSkillRepo.save(existing);
    } else {
      await this.hermesSkillRepo.save(this.hermesSkillRepo.create(data as any));
    }
  }

  /** 触发解析（异步）：检查 source 状态后立即返回，后台异步执行 */
  async triggerAnalyze(id: number): Promise<{ status: string; message: string }> {
    const source = await this.sourceRepo.findOne({ where: { id } });
    if (!source) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `技能源 ${id} 不存在`);
    }
    if (source.status !== 'pending' && source.status !== 'failed') {
      BusinessException.throw(ErrorCode.FORBIDDEN, `技能源当前状态为 ${source.status}，不可重新解析`);
    }

    // 立即将状态置为 analyzing
    source.status = 'analyzing';
    source.errorMessage = undefined;
    await this.sourceRepo.save(source);

    // 后台异步执行分析流程
    this.analyzerService.analyze(id).catch((e) => {
      console.error(`[AdminSkillStore] 异步分析失败: ${(e as Error).message}`);
    });

    return { status: 'analyzing', message: '解析已启动' };
  }

  /** 健康检查：委托给 SkillRunnerService */
  async healthCheck(id: number) {
    return this.skillRunnerService.healthCheck(id);
  }
}

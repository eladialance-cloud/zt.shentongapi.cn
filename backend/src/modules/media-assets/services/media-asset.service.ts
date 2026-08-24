import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindOptionsWhere } from 'typeorm';
import { MediaAssetEntity, MediaAssetType } from '../entities/media-asset.entity';
import { TaskOutputItemEntity } from '../../task/entities/task-output-item.entity';
import { AgentTaskEntity } from '../../task/entities/agent-task.entity';
import { PublishPlanEntity } from '../../channel/entities/publish-plan.entity';
import { MediaJobEntity } from '../../media-generation/entities/media-job.entity';
import {
  CreateMediaAssetDto,
  UpdateMediaAssetDto,
  ImportMediaAssetDto,
  MediaAssetQueryDto,
} from '../dto/media-asset.dto';
import { PaginatedResult } from '../../../common/types/pagination.type';

/** 导入标题摘要最大长度 */
const TITLE_SUMMARY_MAX_LEN = 50;

/** 可直通为素材类型的任务输出/媒体生成类型 */
const MEDIA_TYPES: ReadonlySet<string> = new Set(['image', 'video', 'audio']);

/** 素材使用状态：in_use=被执行/已发布计划引用；selected=被草稿/待审计划引用；unused=无引用 */
export type MediaAssetUsage = 'in_use' | 'selected' | 'unused';

/** 优先级：in_use > selected > unused */
const USAGE_PRIORITY: Record<MediaAssetUsage, number> = {
  in_use: 2,
  selected: 1,
  unused: 0,
};

/** 发布计划状态 → 素材使用状态（rejected/failed 不计入引用） */
function usageForPlanStatus(status: string): MediaAssetUsage | null {
  if (status === 'approved' || status === 'published') return 'in_use';
  if (status === 'draft' || status === 'pending_review') return 'selected';
  return null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  list: MediaAssetEntity[];
}

/** 取文本前 N 字作为标题摘要，空文本用兜底标题 */
function summarizeTitle(text: string | null | undefined, fallback: string): string {
  const trimmed = text?.trim() ?? '';
  return trimmed ? trimmed.slice(0, TITLE_SUMMARY_MAX_LEN) : fallback;
}

/**
 * 素材资产服务
 * 负责素材库的手动登记、列表查询、详情、更新与批量导入（幂等）
 */
@Injectable()
export class MediaAssetService {
  constructor(
    @InjectRepository(MediaAssetEntity)
    private readonly assetRepo: Repository<MediaAssetEntity>,
    @InjectRepository(TaskOutputItemEntity)
    private readonly taskOutputRepo: Repository<TaskOutputItemEntity>,
    @InjectRepository(MediaJobEntity)
    private readonly mediaJobRepo: Repository<MediaJobEntity>,
    @InjectRepository(AgentTaskEntity)
    private readonly agentTaskRepo: Repository<AgentTaskEntity>,
    @InjectRepository(PublishPlanEntity)
    private readonly publishPlanRepo: Repository<PublishPlanEntity>,
  ) {}

  /**
   * 手动登记素材（sourceType=manual）
   */
  async create(userId: number, dto: CreateMediaAssetDto): Promise<MediaAssetEntity> {
    const asset = this.assetRepo.create({
      userId,
      sourceType: 'manual',
      title: dto.title,
      assetType: dto.assetType ?? 'file',
      url: dto.url,
      mimeType: dto.mimeType ?? null,
      fileSize: dto.fileSize ?? null,
      tags: dto.tags ?? null,
      description: dto.description ?? null,
      meta: dto.meta ?? null,
      vectorStatus: 'none',
      archived: false,
    } as unknown as MediaAssetEntity);
    return this.assetRepo.save(asset);
  }

  /**
   * 分页查询素材列表（仅本人；倒序）
   */
  async list(
    userId: number,
    query: MediaAssetQueryDto,
  ): Promise<PaginatedResult<MediaAssetEntity & { usage: MediaAssetUsage }>> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));

    const where: FindOptionsWhere<MediaAssetEntity> = { userId };
    if (query.type) {
      where.assetType = query.type;
    }
    if (query.archived !== undefined) {
      where.archived = query.archived === 'true' || query.archived === '1';
    }

    const [list, total] = await this.assetRepo.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    // 一次性取当前用户全部发布计划，汇总每个素材被引用的最高优先级 usage
    const plans = await this.publishPlanRepo.find({
      where: { userId },
      select: ['id', 'status', 'assetIds'],
    });
    const usageByAssetId = new Map<number, MediaAssetUsage>();
    for (const plan of plans) {
      const usage = usageForPlanStatus(plan.status);
      if (!usage) continue;
      // Number() 归一化防御：历史/第三方数据 assetIds 可能为 string，并过滤 NaN
      for (const assetId of (plan.assetIds ?? []).map(Number).filter((id) => !Number.isNaN(id))) {
        const current = usageByAssetId.get(assetId);
        if (current === undefined || USAGE_PRIORITY[usage] > USAGE_PRIORITY[current]) {
          usageByAssetId.set(assetId, usage);
        }
      }
    }

    const listWithUsage = list.map((asset) => ({
      ...asset,
      usage: usageByAssetId.get(asset.id) ?? 'unused',
    }));

    return {
      list: listWithUsage,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /**
   * 素材详情（权限校验：仅本人）
   */
  async getOne(userId: number, id: number): Promise<MediaAssetEntity> {
    const asset = await this.assetRepo.findOne({ where: { id, userId } });
    if (!asset) {
      throw new NotFoundException(`素材资产 ${id} 不存在`);
    }
    return asset;
  }

  /**
   * 更新素材（title/tags/archived；权限校验：仅本人）
   */
  async update(
    userId: number,
    id: number,
    dto: UpdateMediaAssetDto,
  ): Promise<MediaAssetEntity> {
    const asset = await this.assetRepo.findOne({ where: { id, userId } });
    if (!asset) {
      throw new NotFoundException(`素材资产 ${id} 不存在`);
    }
    if (dto.title !== undefined) asset.title = dto.title;
    if (dto.tags !== undefined) asset.tags = dto.tags;
    if (dto.description !== undefined) asset.description = dto.description;
    if (dto.archived !== undefined) asset.archived = dto.archived;
    if (dto.title !== undefined || dto.tags !== undefined || dto.description !== undefined) {
      asset.vectorStatus = 'none';
    }
    return this.assetRepo.save(asset);
  }

  /**
   * 批量导入素材（幂等）
   * - taskId：从 task_output_item 登记（url=fileUrl；无 fileUrl 跳过；title=content 前 50 字）
   * - mediaJobId：从 media_jobs.resultUrls 登记（仅 status=done；无 resultUrls 跳过）
   * 幂等键：同 user_id + source_type + source_id 已存在则跳过
   */
  async import(userId: number, dto: ImportMediaAssetDto): Promise<ImportResult> {
    const hasTask = dto.taskId !== undefined;
    const hasJob = dto.mediaJobId !== undefined;
    if (hasTask === hasJob) {
      throw new BadRequestException('taskId 与 mediaJobId 必须二选一');
    }
    if (hasTask) {
      return this.importFromTask(userId, dto.taskId as number);
    }
    return this.importFromMediaJob(userId, dto.mediaJobId as number);
  }

  /**
   * 从 task_output_item 导入
   * 归属校验：先校验 agent_task.userId === 当前用户，防跨用户读取他人任务输出（IDOR）
   */
  private async importFromTask(userId: number, taskId: number): Promise<ImportResult> {
    const task = await this.agentTaskRepo.findOne({ where: { id: taskId, userId } });
    if (!task) {
      throw new NotFoundException(`任务 ${taskId} 不存在或不属于当前用户`);
    }
    const items = await this.taskOutputRepo.find({ where: { taskId } });
    let skipped = 0;
    const candidates = items.filter((item) => {
      if (!item.fileUrl || !item.fileUrl.trim()) {
        skipped += 1;
        return false;
      }
      return true;
    });
    if (candidates.length === 0) {
      return { imported: 0, skipped, list: [] };
    }

    const existing = await this.assetRepo.find({
      where: {
        userId,
        sourceType: 'task',
        sourceId: In(candidates.map((item) => item.id)),
      },
    });
    const existingSourceIds = new Set(existing.map((asset) => asset.sourceId));

    const assets: MediaAssetEntity[] = [];
    for (const item of candidates) {
      if (existingSourceIds.has(item.id)) {
        skipped += 1;
        continue;
      }
      assets.push(
        this.assetRepo.create({
          userId,
          sourceType: 'task',
          sourceId: item.id,
          title: summarizeTitle(item.content, `task 输出 #${taskId}`),
          assetType: MEDIA_TYPES.has(item.outputType)
            ? (item.outputType as MediaAssetType)
            : 'file',
          url: item.fileUrl as string,
          mimeType: item.mimeType ?? null,
          fileSize: item.fileSize ?? null,
          tags: null,
          archived: false,
        } as unknown as MediaAssetEntity),
      );
    }
    if (assets.length === 0) {
      return { imported: 0, skipped, list: [] };
    }
    const saved = await this.assetRepo.save(assets);
    return { imported: saved.length, skipped, list: saved };
  }

  /**
   * 从 media_jobs 导入（归属校验：userId 必须匹配；仅 status=done）
   */
  private async importFromMediaJob(userId: number, mediaJobId: number): Promise<ImportResult> {
    const job = await this.mediaJobRepo.findOne({ where: { id: mediaJobId, userId } });
    if (!job) {
      throw new NotFoundException(`生成任务 ${mediaJobId} 不存在或不属于当前用户`);
    }
    if (job.status !== 'done') {
      throw new BadRequestException('生成任务尚未完成，无法导入');
    }
    const urls = (job.resultUrls ?? []).filter((url) => url && url.trim().length > 0);
    if (urls.length === 0) {
      return { imported: 0, skipped: 0, list: [] };
    }

    // 幂等：同 source_type + source_id 已存在则整体跳过
    const existing = await this.assetRepo.find({
      where: { userId, sourceType: 'media_job', sourceId: mediaJobId },
    });
    if (existing.length > 0) {
      return { imported: 0, skipped: urls.length, list: [] };
    }

    const assets: MediaAssetEntity[] = urls.map((url) =>
      this.assetRepo.create({
        userId,
        sourceType: 'media_job',
        sourceId: mediaJobId,
        title: summarizeTitle(job.prompt, `media job #${mediaJobId}`),
        assetType: MEDIA_TYPES.has(job.type) ? (job.type as MediaAssetType) : 'file',
        url,
        mimeType: null,
        fileSize: null,
        tags: null,
        archived: false,
      } as unknown as MediaAssetEntity),
    );
    const saved = await this.assetRepo.save(assets);
    return { imported: saved.length, skipped: 0, list: saved };
  }
}
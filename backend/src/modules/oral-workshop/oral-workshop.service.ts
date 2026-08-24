import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { OralWorkshopJobEntity, OralWorkshopJobStatus } from './entities/oral-workshop-job.entity';
import { OralWorkshopStepEntity } from './entities/oral-workshop-step.entity';
import { VoiceAssetEntity } from './entities/voice-asset.entity';
import { DigitalHumanAssetEntity } from './entities/digital-human-asset.entity';
import type { OralWorkshopLlmService } from './llm';
import type { TopicItem } from './llm';
import { CreditsBillingService } from '../credits/services/credits-billing.service';
import { SystemLlmService } from './system-llm.service';
import { defaultFfmpegRunner, downloadTo } from './oral-workshop.executor';
import { BatchCreateOralWorkshopJobsDto, CreateOralWorkshopJobDto, OralWorkshopJobQueryDto } from './dto/oral-workshop.dto';
import { listTemplates as listTemplatesLoader } from './template-loader';
import {
  buildInitialSteps,
  jobStatusAfterSteps,
  markStepDone as pipelineMarkStepDone,
  markStepFailed as pipelineMarkStepFailed,
  nextPendingStep,
  type PipelineStepSeed,
  type PipelineStepState,
} from './oral-workshop.pipeline';

/** 单条任务预估 Credits（M1 固定值；后续里程碑改为管理后台价格配置表） */
export const DEFAULT_ESTIMATED_CREDITS = 21;

export interface OralWorkshopJobItem {
  id: number;
  status: OralWorkshopJobStatus;
  currentStep: string | null;
  scriptInput: string | null;
  rewrittenScript: string | null;
  persona: string | null;
  digitalHumanId: number | null;
  voiceId: number | null;
  templateId: number | null;
  videoUrl: string | null;
  audioUrl: string | null;
  coverUrl: string | null;
  creditsCost: number;
  bilingual: boolean;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    step: string;
    stepOrder: number;
    status: string;
    resultJson: Record<string, unknown> | null;
    error: string | null;
    retryCount: number;
    startedAt: Date | null;
    finishedAt: Date | null;
  }>;
}

/**
 * 口播工坊任务服务
 * 职责：幂等创建（预扣 Credits）→ 列表/详情 → 取消退款 → 孤儿任务回收。
 * 步骤执行器（LLM/火山/ffmpeg）由 M2+ 里程碑实现，通过 markStepDone/markStepFailed 驱动状态机。
 */
@Injectable()
export class OralWorkshopService implements OnModuleInit {
  private readonly logger = new Logger(OralWorkshopService.name);

  constructor(
    @InjectRepository(OralWorkshopJobEntity)
    private readonly jobRepo: Repository<OralWorkshopJobEntity>,
    @InjectRepository(OralWorkshopStepEntity)
    private readonly stepRepo: Repository<OralWorkshopStepEntity>,
    @InjectRepository(VoiceAssetEntity)
    private readonly voiceAssetRepo: Repository<VoiceAssetEntity>,
    @InjectRepository(DigitalHumanAssetEntity)
    private readonly dhAssetRepo: Repository<DigitalHumanAssetEntity>,
    private readonly billing: CreditsBillingService,
    private readonly llm: OralWorkshopLlmService,
    private readonly systemLlm: SystemLlmService,
  ) {}

  /** 启动时回收孤儿任务：pending/processing → failed 并退还预扣 Credits（参考 media-generation） */
  async onModuleInit(): Promise<void> {
    try {
      const orphans = await this.jobRepo.find({
        where: [{ status: 'pending' }, { status: 'processing' }],
      });
      for (const job of orphans) {
        job.status = 'failed';
        job.error = '服务重启导致任务中断，Credits 已退还';
        await this.jobRepo.save(job);
        if (job.frozenTxnId) {
          try {
            await this.billing.refund(job.userId, job.frozenTxnId);
          } catch (refundErr) {
            this.logger.error(`[oral-workshop] refund orphan job ${job.id} failed: ${refundErr}`);
          }
        }
      }
      if (orphans.length > 0) {
        this.logger.log(`[oral-workshop] 回收孤儿任务 ${orphans.length} 条`);
      }
    } catch (err) {
      this.logger.error('[oral-workshop] orphan recovery failed:', err);
    }
  }

  /** 学习对标：从对标视频 URL 提取口播文案（下载视频 → ffmpeg 抽音频 → STT 识别，不计费） */
  async extractScript(userId: number, videoUrl: string): Promise<{ text: string }> {
    if (!/^https?:\/\//i.test(videoUrl)) {
      throw new BadRequestException('请输入有效的视频链接（http/https）');
    }
    const dir = path.join(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads', 'oral-workshop', 'extract', String(userId), String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const videoPath = path.join(dir, 'source' + (/\.(mp4|mov|avi|mkv|flv|webm)(\?|$)/i.test(videoUrl) ? videoUrl.match(/\.(mp4|mov|avi|mkv|flv|webm)/i)![0] : '.mp4'));
    try {
      await downloadTo(videoUrl, videoPath);
    } catch (err) {
      throw new BadRequestException('对标视频下载失败: ' + (err as Error).message);
    }
    const audioPath = path.join(dir, 'audio.wav');
    try {
      await defaultFfmpegRunner(
        ['ffmpeg', '-y', '-i', videoPath, '-vn', '-ar', '16000', '-ac', '1', audioPath],
        dir,
      );
    } catch (err) {
      throw new BadRequestException('音频提取失败（服务器需安装 ffmpeg）: ' + (err as Error).message);
    }
    try {
      const text = await this.systemLlm.stt(audioPath);
      return { text };
    } catch (err) {
      throw new BadRequestException('语音识别失败: ' + (err as Error).message);
    }
  }
  /** 幂等创建任务：先预扣 Credits，再建 job + 7 个初始步骤 */
  async create(userId: number, dto: CreateOralWorkshopJobDto): Promise<OralWorkshopJobItem> {
    // 幂等：clientTxnId 已存在直接返回
    if (dto.clientTxnId) {
      const existed = await this.jobRepo.findOne({ where: { clientTxnId: dto.clientTxnId, userId } });
      if (existed) return this.get(userId, existed.id);
    }

    const estimatedCost = DEFAULT_ESTIMATED_CREDITS;
    const frozen = await this.billing.estimateAndFreeze(
      userId,
      'oral_workshop',
      dto.clientTxnId ?? `ow-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      estimatedCost,
    );

    try {
      const job = this.jobRepo.create({
        userId,
        clientTxnId: dto.clientTxnId ?? null,
        status: 'pending',
        scriptInput: dto.scriptInput,
        persona: dto.persona ?? null,
        digitalHumanId: dto.digitalHumanId ?? null,
        voiceId: dto.voiceId ?? null,
        templateId: dto.templateId ?? null,
        audioUrl: dto.audioUrl ?? null,
        videoUrl: dto.videoUrl ?? null,
        bilingual: dto.bilingual ?? false,
        frozenTxnId: frozen.id,
      });
      const saved = await this.jobRepo.save(job);

      const seeds: PipelineStepSeed[] = buildInitialSteps(saved.id);
      await this.stepRepo.save(
        seeds.map((s) => this.stepRepo.create(s as Partial<OralWorkshopStepEntity>)),
      );

      return this.get(userId, saved.id);
    } catch (err) {
      // 建单失败必须退回预扣 Credits，避免永久泄漏
      try {
        await this.billing.refund(userId, frozen.id);
      } catch (refundErr) {
        this.logger.error(`[oral-workshop] 建单失败后退款失败（frozenTxn=${frozen.id}）: ${(refundErr as Error).message}`);
      }
      throw err;
    }
  }

  /** 批量矩阵化建单：文案 × 模板 × 声音 × 形象（对标参考软件 draft:batch-create） */
  async createBatch(
    userId: number,
    dto: BatchCreateOralWorkshopJobsDto,
  ): Promise<{
    total: number;
    created: OralWorkshopJobItem[];
    skipped: number;
    errors: Array<{ topic: string; reason: string }>;
  }> {
    const templates: Array<number | undefined> = dto.templateIds?.length ? dto.templateIds : [undefined];
    const voices: Array<number | undefined> = dto.voiceIds?.length ? dto.voiceIds : [undefined];
    const humans: Array<number | undefined> = dto.digitalHumanIds?.length ? dto.digitalHumanIds : [undefined];
    const total = dto.topics.length * templates.length * voices.length * humans.length;
    if (total > 50) {
      throw new BadRequestException(`批量任务数 ${total} 超过单次上限 50，请减少文案/模板/声音/形象的组合`);
    }

    const batchKey =
      dto.batchTxnId ?? `ow-batch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const created: OralWorkshopJobItem[] = [];
    const errors: Array<{ topic: string; reason: string }> = [];
    let index = 0;
    for (const topic of dto.topics) {
      for (const templateId of templates) {
        for (const voiceId of voices) {
          for (const digitalHumanId of humans) {
            index += 1;
            try {
              const job = await this.create(userId, {
                scriptInput: topic,
                goal: dto.goal,
                targetAudience: dto.targetAudience,
                platforms: dto.platforms,
                style: dto.style,
                persona: dto.persona,
                templateId,
                voiceId,
                digitalHumanId,
                audioUrl: dto.audioUrl,
                videoUrl: dto.videoUrl,
                bilingual: dto.bilingual ?? false,
                clientTxnId: `${batchKey}-${index}`,
              });
              created.push(job);
            } catch (err) {
              errors.push({ topic, reason: (err as Error)?.message ?? String(err) });
            }
          }
        }
      }
    }
    return { total, created, skipped: errors.length, errors };
  }

  /** 列表（分页，按创建时间倒序） */
  async list(userId: number, query: OralWorkshopJobQueryDto): Promise<{ list: OralWorkshopJobItem[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.max(query.pageSize || 20, 1);
    const where: Record<string, unknown> = { userId };
    if (query.status) where.status = query.status;
    const [items, total] = await this.jobRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const list = await Promise.all(items.map((j) => this.toItem(j)));
    return { list, total, page, pageSize };
  }

  /** 详情（含步骤明细） */
  async get(userId: number, id: number): Promise<OralWorkshopJobItem> {
    const job = await this.jobRepo.findOne({ where: { id, userId } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    return this.toItem(job);
  }

  /** 取消任务：仅 pending/processing 可取消；退还预扣 Credits */
  async cancel(userId: number, id: number): Promise<OralWorkshopJobItem> {
    const job = await this.jobRepo.findOne({ where: { id, userId } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    // 原子抢占状态，避免与执行器并发（执行器正在跑该步时取消，done 写入会被下面的状态检查拦截）
    const result = await this.jobRepo.update(
      { id, userId, status: In(['pending', 'processing']) },
      { status: 'cancelled', error: '用户取消' },
    );
    if (!result.affected || result.affected === 0) {
      throw new BadRequestException(`当前状态 ${job.status} 不可取消`);
    }
    if (job.frozenTxnId) {
      await this.billing.refund(userId, job.frozenTxnId);
    }
    return this.get(userId, id);
  }

  /** 供执行器轮询：取待执行任务（pending/processing，最早优先，限量） */
  async findExecutableJobs(limit = 5): Promise<OralWorkshopJobEntity[]> {
    return this.jobRepo.find({
      where: [{ status: 'pending' }, { status: 'processing' }],
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /** 供执行器取某任务下一个待执行步骤名（无则 null） */
  async nextPendingStepOf(jobId: number): Promise<string | null> {
    const steps = await this.loadSteps(jobId);
    return nextPendingStep(steps)?.step ?? null;
  }

  // ===== 我的声音资产（对标参考软件"声音克隆/训练/预览"） =====

  /** 我的声音列表 */
  async listVoices(userId: number): Promise<Array<{ id: number; name: string; refAudioUrl: string; speakerId: string | null; status: string; createdAt: Date }>> {
    const rows = await this.voiceAssetRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      refAudioUrl: r.refAudioUrl,
      speakerId: r.speakerId ?? null,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /** 新增声音（参考音频 URL；克隆在任务 voiceClone 步骤按 voiceId 触发） */
  async createVoice(userId: number, dto: { name: string; refAudioUrl: string }): Promise<{ id: number; name: string; refAudioUrl: string; status: string }> {
    if (!dto.name?.trim() || !dto.refAudioUrl?.trim()) {
      throw new BadRequestException('声音名称与参考音频 URL 不能为空');
    }
    const entity = this.voiceAssetRepo.create({
      userId,
      name: dto.name.trim().slice(0, 128),
      refAudioUrl: dto.refAudioUrl.trim().slice(0, 512),
      status: 'ready',
    });
    const saved = await this.voiceAssetRepo.save(entity);
    return { id: saved.id, name: saved.name, refAudioUrl: saved.refAudioUrl, status: saved.status };
  }

  /** 删除声音 */
  async deleteVoice(userId: number, id: number): Promise<void> {
    const row = await this.voiceAssetRepo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('声音不存在');
    await this.voiceAssetRepo.remove(row);
  }

  // ===== 我的数字人形象（对标参考软件"形象库/授权状态"） =====

  /** 我的形象列表 */
  async listDigitalHumans(userId: number): Promise<Array<{ id: number; name: string; cloudId: string; previewUrl: string | null; authorized: boolean; status: string; createdAt: Date }>> {
    const rows = await this.dhAssetRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      cloudId: r.cloudId,
      previewUrl: r.previewUrl ?? null,
      authorized: r.authorized,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /** 新增形象（cloudId=火山数字人形象 ID） */
  async createDigitalHuman(userId: number, dto: { name: string; cloudId: string; previewUrl?: string }): Promise<{ id: number; name: string; cloudId: string; authorized: boolean }> {
    if (!dto.name?.trim() || !dto.cloudId?.trim()) {
      throw new BadRequestException('形象名称与形象 ID 不能为空');
    }
    const entity = this.dhAssetRepo.create({
      userId,
      name: dto.name.trim().slice(0, 128),
      cloudId: dto.cloudId.trim().slice(0, 128),
      previewUrl: dto.previewUrl?.trim().slice(0, 512) ?? null,
      authorized: true,
      status: 'ready',
    });
    const saved = await this.dhAssetRepo.save(entity);
    return { id: saved.id, name: saved.name, cloudId: saved.cloudId, authorized: saved.authorized };
  }

  /** 删除形象 */
  async deleteDigitalHuman(userId: number, id: number): Promise<void> {
    const row = await this.dhAssetRepo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('形象不存在');
    await this.dhAssetRepo.remove(row);
  }

  // ===== 选题灵感（对标参考软件"爆款选题/关键词选题"） =====

  /** 选题生成：关键词 + 人设 → 5 个选题（LLM，失败返回可读错误） */
  async generateTopics(userId: number, dto: { keywords: string; persona?: string; count?: number }): Promise<TopicItem[]> {
    if (!dto.keywords?.trim()) throw new BadRequestException('请输入选题关键词');
    try {
      return await this.llm.generateTopics(dto.keywords.trim(), {
        persona: dto.persona?.trim() || undefined,
        count: Math.min(Math.max(dto.count ?? 5, 1), 10),
      });
    } catch (err) {
      throw new BadRequestException('选题生成失败: ' + (err as Error).message);
    }
  }

  /** 可用模板列表（工作台选择用，返回轻量元数据） */
  async listTemplates(): Promise<Array<{
    template_id: string;
    name: string;
    version: string;
    description?: string;
    preview_video_url?: string;
    cover_image_url?: string;
    width: number;
    height: number;
    duration: number;
  }>> {
    const templates = listTemplatesLoader();
    return templates.map((t) => ({
      template_id: t.template_id,
      name: t.name,
      version: t.version,
      description: t.description,
      preview_video_url: t.preview_video_url,
      cover_image_url: t.cover_image_url,
      width: t.project_settings.width,
      height: t.project_settings.height,
      duration: t.project_settings.duration,
    }));
  }

  /** 取任务全部步骤产物（step → resultJson），供执行器组装视频合成输入 */
  async getStepResults(jobId: number): Promise<Record<string, Record<string, unknown>>> {
    const rows = await this.stepRepo.find({ where: { jobId } });
    const out: Record<string, Record<string, unknown>> = {};
    for (const row of rows) {
      if (row.resultJson && typeof row.resultJson === 'object') {
        out[row.step] = row.resultJson as Record<string, unknown>;
      }
    }
    return out;
  }

  // ===== M2+ 步骤执行器调用的状态推进原语（本期不对外暴露 HTTP） =====

  /** 标记某步为 running：写 startedAt、任务置 processing、currentStep 指向该步（防重复执行） */
  async markStepRunning(jobId: number, stepName: string): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    if (job.status === 'cancelled') {
      throw new Error('任务已取消，无法继续执行');
    }
    // 原子抢占步骤：多实例部署时防止同一 step 被重复执行
    const step = await this.stepRepo.findOne({
      where: { jobId, step: stepName, status: 'pending' as const },
    });
    if (!step) throw new Error(`步骤 ${stepName} 不存在或已被占用`);
    const claim = await this.stepRepo.update(
      { id: step.id, status: 'pending' },
      { status: 'running', startedAt: new Date() },
    );
    if (!claim.affected || claim.affected === 0) {
      throw new Error(`步骤 ${stepName} 已被其他执行实例占用`);
    }
    job.status = 'processing';
    job.currentStep = stepName;
    await this.jobRepo.save(job);
  }


  /** 标记某步 done：写产物、推进 currentStep；全部完成后结算实际成本 */
  async markStepDone(jobId: number, stepName: string, resultJson?: Record<string, unknown>): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    if (job.status === 'cancelled') {
      throw new Error('任务已取消，无法继续执行');
    }
    const steps = await this.loadSteps(jobId);
    const next = pipelineMarkStepDone(steps, stepName, resultJson);
    await this.stepRepo.save(next.map((s) => this.toStepEntity(s, true)));
    this.applyJobArtifacts(job, resultJson);
    await this.syncJobProgress(job, next);
  }

  /** 标记某步 failed：可重试则回 pending，否则任务 failed 并退款 */
  async markStepFailed(jobId: number, stepName: string, error: string): Promise<void> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    if (job.status === 'cancelled') {
      this.logger.warn(`[oral-workshop] 任务 ${jobId} 已取消，跳过失败标记`);
      return;
    }
    const steps = await this.loadSteps(jobId);
    const { steps: next, permanentlyFailed } = pipelineMarkStepFailed(steps, stepName, error);
    await this.stepRepo.save(next.map((s) => this.toStepEntity(s, true)));
    if (permanentlyFailed) {
      job.status = 'failed';
      job.error = error;
      await this.jobRepo.save(job);
      if (job.frozenTxnId) {
        await this.billing.refund(job.userId, job.frozenTxnId);
      }
    } else {
      await this.syncJobProgress(job, next);
    }
  }

  // ===== 内部实现 =====

  private async loadSteps(jobId: number): Promise<PipelineStepState[]> {
    const rows = await this.stepRepo.find({ where: { jobId }, order: { stepOrder: 'ASC' } });
    return rows.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      step: r.step,
      stepOrder: r.stepOrder,
      status: r.status as PipelineStepState['status'],
      resultJson: r.resultJson ?? undefined,
      error: r.error ?? undefined,
      retryCount: r.retryCount,
      startedAt: r.startedAt ?? undefined,
    }));
  }

  private async syncJobProgress(job: OralWorkshopJobEntity, steps: PipelineStepState[]): Promise<void> {
    const next = nextPendingStep(steps);
    job.currentStep = next ? next.step : null;
    const status = jobStatusAfterSteps(steps);
    if (status === 'done') {
      job.status = 'done';
      if (job.frozenTxnId) {
        const actual = job.creditsCost > 0 ? job.creditsCost : DEFAULT_ESTIMATED_CREDITS;
        await this.billing.settleActualCost(job.userId, job.frozenTxnId, actual);
      }
    } else {
      job.status = status;
    }
    await this.jobRepo.save(job);
  }

  private toStepEntity(s: PipelineStepState, finished = false): Partial<OralWorkshopStepEntity> {
    return {
      ...(s.id !== undefined ? { id: s.id } : {}),
      ...(s.jobId !== undefined ? { jobId: s.jobId } : {}),
      step: s.step,
      stepOrder: s.stepOrder,
      status: s.status,
      resultJson: (s.resultJson as Record<string, unknown> | undefined) ?? null,
      error: s.error ?? null,
      retryCount: s.retryCount,
      ...(s.startedAt ? { startedAt: s.startedAt } : {}),
      ...(finished ? { finishedAt: new Date() } : {}),
    };
  }

  /** 从步骤产物回填任务产物列（rewritten_script / video_url / audio_url / cover_url / 标题元数据） */
  private applyJobArtifacts(job: OralWorkshopJobEntity, resultJson?: Record<string, unknown>): void {
    if (!resultJson) return;
    if (typeof resultJson.rewritten_script === 'string') job.rewrittenScript = resultJson.rewritten_script;
    if (typeof resultJson.video_url === 'string') job.videoUrl = this.persistArtifact(job.id, resultJson.video_url);
    if (typeof resultJson.audio_url === 'string') job.audioUrl = this.persistArtifact(job.id, resultJson.audio_url);
    if (typeof resultJson.cover_url === 'string') job.coverUrl = this.persistArtifact(job.id, resultJson.cover_url);
  }

  /** 把产物从临时目录复制到持久化 uploads/oral-workshop/<jobId>/，返回可访问的相对 URL（重启不丢、前端可预览） */
  private persistArtifact(jobId: number, filePath: string): string {
    try {
      if (!filePath || /^https?:\/\//i.test(filePath)) return filePath;
      const src = path.resolve(filePath);
      if (!fs.existsSync(src)) return filePath;
      const destDir = path.resolve('./uploads/oral-workshop/' + jobId);
      fs.mkdirSync(destDir, { recursive: true });
      const base = path.basename(src);
      fs.copyFileSync(src, path.join(destDir, base));
      return '/uploads/oral-workshop/' + jobId + '/' + base;
    } catch (err) {
      this.logger.warn(`[oral-workshop] 产物持久化失败（job=${jobId}, ${filePath}）: ${(err as Error).message}`);
      return filePath;
    }
  }

  private async toItem(job: OralWorkshopJobEntity): Promise<OralWorkshopJobItem> {
    const steps = await this.stepRepo.find({ where: { jobId: job.id }, order: { stepOrder: 'ASC' } });
    return {
      id: job.id,
      status: job.status,
      currentStep: job.currentStep ?? null,
      scriptInput: job.scriptInput ?? null,
      rewrittenScript: job.rewrittenScript ?? null,
      persona: job.persona ?? null,
      digitalHumanId: job.digitalHumanId ?? null,
      voiceId: job.voiceId ?? null,
      templateId: job.templateId ?? null,
      videoUrl: job.videoUrl ?? null,
      audioUrl: job.audioUrl ?? null,
      coverUrl: job.coverUrl ?? null,
      creditsCost: job.creditsCost,
      bilingual: !!job.bilingual,
      error: job.error ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      steps: steps.map((s) => ({
        step: s.step,
        stepOrder: s.stepOrder,
        status: s.status,
        resultJson: s.resultJson ?? null,
        error: s.error ?? null,
        retryCount: s.retryCount,
        startedAt: s.startedAt ?? null,
        finishedAt: s.finishedAt ?? null,
      })),
    };
  }
}

import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { OralWorkshopJobEntity, OralWorkshopJobStatus } from './entities/oral-workshop-job.entity';
import { OralWorkshopStepEntity } from './entities/oral-workshop-step.entity';
import { VoiceAssetEntity } from './entities/voice-asset.entity';
import { DigitalHumanAssetEntity } from './entities/digital-human-asset.entity';
import { OralWorkshopLlmService } from './llm';
import type { TopicItem } from './llm';
import { CreditsBillingService } from '../credits/services/credits-billing.service';
import { SystemLlmService } from './system-llm.service';
import { SystemConfigEntity } from '../admin-system/entities/system-config.entity';
import { defaultFfmpegRunner, downloadTo, assertPublicMediaUrl, looksLikeHtml, resolveDirectMediaUrl } from './ffmpeg';
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
  voiceSpeakerId: string | null;
  templateId: number | null;
  videoUrl: string | null;
  audioUrl: string | null;
  coverUrl: string | null;
  coverH1: string | null;
  coverH2: string | null;
  coverConfig: string | null;
  creditsCost: number;
  bilingual: boolean;
  targetLang: string | null;
  executionMode: 'auto' | 'manual' | 'single';
  waitingStep: string | null;
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
    @Optional() @InjectRepository(SystemConfigEntity)
    private readonly configRepo?: Repository<SystemConfigEntity>,
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

  /** 学习对标：从对标视频链接提取口播文案（下载 → ffmpeg 抽音频 → STT 识别，不计费）
   *  支持媒体直链（.mp4/.mov/.mp3…）；抖音/快手/B站等网页链接自动尝试 yt-dlp 解析真实直链。 */
  async extractScript(userId: number, videoUrl: string): Promise<{ text: string }> {
    if (!/^https?:\/\//i.test(videoUrl)) {
      throw new BadRequestException('请输入有效的视频链接（http/https）');
    }
    try {
      await assertPublicMediaUrl(videoUrl);
    } catch (err) {
      throw new BadRequestException('视频链接不可访问: ' + (err as Error).message);
    }
    const dir = path.join(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads', 'oral-workshop', 'extract', String(userId), String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const extMatch = videoUrl.match(/\.(mp4|mov|avi|mkv|flv|webm|mp3|m4a|wav|aac)(\?|$)/i);
    const videoPath = path.join(dir, 'source' + (extMatch ? '.' + extMatch[1].toLowerCase() : '.mp4'));

    // 1) 下载内容（媒体直链直接作为源文件；网页链接先下载探测）
    try {
      await downloadTo(videoUrl, videoPath);
    } catch (err) {
      throw new BadRequestException('对标视频下载失败: ' + (err as Error).message);
    }

    // 2) 下载结果是网页（HTML）→ 尝试 yt-dlp 解析真实媒体直链后重新下载
    if (looksLikeHtml(this.readFileHead(videoPath))) {
      try {
        const direct = await resolveDirectMediaUrl(videoUrl);
        await downloadTo(direct, videoPath);
      } catch (err) {
        throw new BadRequestException(
          '该链接是网页而非视频文件直链，自动解析失败: ' + (err as Error).message +
          '。可直接粘贴 .mp4/.mov 等视频直链，或在服务器安装 yt-dlp（sudo pip3 install -U yt-dlp）后重试'
        );
      }
    }

    // 3) 二次校验：空文件 / 仍是 HTML → 明确报错（避免 ffmpeg 解析网页报无意义的退出码）
    const stat = fs.statSync(videoPath);
    if (!stat.size) {
      throw new BadRequestException('对标视频下载为空，请确认链接可公开访问');
    }
    if (looksLikeHtml(this.readFileHead(videoPath))) {
      throw new BadRequestException('下载内容不是可识别的音视频文件，请粘贴 .mp4/.mov/.mp3 等媒体直链');
    }

    // 4) ffmpeg 抽音频（16kHz 单声道 WAV 供 STT 识别）
    const audioPath = path.join(dir, 'audio.wav');
    try {
      await defaultFfmpegRunner(
        ['ffmpeg', '-y', '-i', videoPath, '-vn', '-ar', '16000', '-ac', '1', audioPath],
        dir,
      );
    } catch (err) {
      const msg = (err as Error).message || String(err);
      const missingFfmpeg = /ENOENT|spawn ffmpeg/.test(msg);
      throw new BadRequestException(
        '音频提取失败' + (missingFfmpeg ? '（服务器未安装 ffmpeg，请执行: sudo apt-get install -y ffmpeg）' : '') + ': ' + msg
      );
    }
    try {
      const text = await this.systemLlm.stt(audioPath);
      return { text };
    } catch (err) {
      throw new BadRequestException('语音识别失败: ' + (err as Error).message);
    }
  }

  /** 读取文件头 N 字节（大视频只读头部探测，避免整文件载入内存） */
  private readFileHead(p: string, n = 4096): Buffer {
    const fd = fs.openSync(p, 'r');
    try {
      const buf = Buffer.alloc(n);
      const read = fs.readSync(fd, buf, 0, n, 0);
      return buf.subarray(0, read);
    } finally {
      fs.closeSync(fd);
    }
  }
  /** 生成封面标题（h1/h2，AI）并持久化到任务 */
  async generateCoverTitle(userId: number, jobId: number): Promise<{ h1: string; h2: string }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('任务不存在');
    if (!this.llm) throw new BadRequestException('AI 服务未配置');
    const script = job.rewrittenScript || job.scriptInput || '';
    if (!script) throw new BadRequestException('任务没有文案，无法生成标题');
    const title = await this.llm.generateCoverTitle(script);
    job.coverH1 = title.h1;
    job.coverH2 = title.h2;
    await this.jobRepo.save(job);
    return title;
  }

  /** 保存封面设计（封面图 URL + 主/副标题 + 设计配置） */
  async saveCover(
    userId: number,
    jobId: number,
    dto: { coverUrl: string; coverH1?: string; coverH2?: string; coverConfig?: string },
  ): Promise<OralWorkshopJobItem> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId } });
    if (!job) throw new NotFoundException('任务不存在');
    if (!dto.coverUrl || !/^https?:\/\//i.test(dto.coverUrl)) {
      throw new BadRequestException('coverUrl 必须是有效的 http/https 链接');
    }
    job.coverUrl = dto.coverUrl;
    job.coverH1 = dto.coverH1?.trim() ? dto.coverH1.trim() : null;
    job.coverH2 = dto.coverH2?.trim() ? dto.coverH2.trim() : null;
    job.coverConfig = dto.coverConfig ?? null;
    await this.jobRepo.save(job);
    return this.toItem(job);
  }
  /** 档位积分估算：基础费 + 配音档价 + 数字人档价（读管理后台 system_config.oral_workshop） */
  async estimateCredits(dto: { voiceModelVersion?: 'V1' | 'V2'; dhModelVersion?: 'V1' | 'V2' }): Promise<number> {
    let base = 5;
    let voiceCost = 0;
    let dhCost = 0;
    if (this.configRepo) {
      try {
        const row = await this.configRepo.findOne({ where: { section: 'oral_workshop' } });
        const cfg = (row?.configValue ?? {}) as Record<string, unknown>;
        if (typeof cfg.baseCredits === 'number' && cfg.baseCredits >= 0) base = Math.round(cfg.baseCredits);
        const vv = dto.voiceModelVersion || 'V2';
        const vt = cfg[vv === 'V1' ? 'voiceTierV1' : 'voiceTierV2'] as Record<string, unknown> | undefined;
        if (vt && typeof vt.creditsCost === 'number' && vt.creditsCost >= 0) voiceCost = Math.round(vt.creditsCost);
        const dv = dto.dhModelVersion || 'V2';
        const dt = cfg[dv === 'V1' ? 'dhTierV1' : 'dhTierV2'] as Record<string, unknown> | undefined;
        if (dt && typeof dt.creditsCost === 'number' && dt.creditsCost >= 0) dhCost = Math.round(dt.creditsCost);
      } catch (err) {
        this.logger.warn('[oral-workshop] 读取积分配置失败，使用默认值: ' + (err as Error).message);
      }
    }
    return Math.max(base + voiceCost + dhCost, 1);
  }

  /** 口播工坊元数据（桌面端工作台）：官方音色池 + 档位积分定价 */
  async getWorkshopMeta(): Promise<{
    voicePool: Array<{ speakerId: string; name?: string; resourceId?: string }>;
    pricing: { baseCredits: number; voiceV1: number; voiceV2: number; dhV1: number; dhV2: number };
  }> {
    const voicePool = await this.getVoicePool();
    const pricing = { baseCredits: 5, voiceV1: 0, voiceV2: 0, dhV1: 0, dhV2: 0 };
    if (this.configRepo) {
      try {
        const row = await this.configRepo.findOne({ where: { section: 'oral_workshop' } });
        const cfg = (row?.configValue ?? {}) as Record<string, unknown>;
        const numOf = (k: string, fb: number): number => {
          const v = cfg[k];
          return typeof v === 'number' && v >= 0 ? Math.round(v) : fb;
        };
        pricing.baseCredits = numOf('baseCredits', 5);
        const t1 = (cfg.voiceTierV1 ?? {}) as Record<string, unknown>;
        const t2 = (cfg.voiceTierV2 ?? {}) as Record<string, unknown>;
        const d1 = (cfg.dhTierV1 ?? {}) as Record<string, unknown>;
        const d2 = (cfg.dhTierV2 ?? {}) as Record<string, unknown>;
        if (typeof t1.creditsCost === 'number') pricing.voiceV1 = Math.round(t1.creditsCost);
        if (typeof t2.creditsCost === 'number') pricing.voiceV2 = Math.round(t2.creditsCost);
        if (typeof d1.creditsCost === 'number') pricing.dhV1 = Math.round(d1.creditsCost);
        if (typeof d2.creditsCost === 'number') pricing.dhV2 = Math.round(d2.creditsCost);
      } catch (err) {
        this.logger.warn('[oral-workshop] 读取工作台元数据失败: ' + (err as Error).message);
      }
    }
    return { voicePool, pricing };
  }

  /** 官方音色池（管理后台维护，桌面端/工作台展示可选音色） */
  async getVoicePool(): Promise<Array<{ speakerId: string; name?: string; resourceId?: string }>> {
    if (!this.configRepo) return [];
    try {
      const row = await this.configRepo.findOne({ where: { section: 'oral_workshop' } });
      const cfg = (row?.configValue ?? {}) as Record<string, unknown>;
      if (!Array.isArray(cfg.voicePool)) return [];
      return cfg.voicePool
        .filter((v): v is { speakerId?: unknown; name?: unknown; resourceId?: unknown } => typeof v === 'object' && v !== null)
        .map((v) => ({
          speakerId: String(v.speakerId ?? '').trim(),
          name: typeof v.name === 'string' ? v.name : '',
          resourceId: typeof v.resourceId === 'string' && v.resourceId ? v.resourceId : 'seed-tts-2.0',
        }))
        .filter((v) => !!v.speakerId);
    } catch (err) {
      this.logger.warn('[oral-workshop] 读取音色池失败: ' + (err as Error).message);
      return [];
    }
  }

  /** 幂等创建任务：先预扣 Credits，再建 job + 7 个初始步骤 */
  async create(userId: number, dto: CreateOralWorkshopJobDto): Promise<OralWorkshopJobItem> {
    // 幂等：clientTxnId 已存在直接返回
    if (dto.clientTxnId) {
      const existed = await this.jobRepo.findOne({ where: { clientTxnId: dto.clientTxnId, userId } });
      if (existed) return this.get(userId, existed.id);
    }

    const estimatedCost = await this.estimateCredits(dto);
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
        voiceSpeakerId: dto.speakerId || null,
        templateId: dto.templateId ?? null,
        audioUrl: dto.audioUrl ?? null,
        videoUrl: dto.videoUrl ?? null,
        bilingual: dto.bilingual ?? false,
        targetLang: dto.targetLang ?? null,
        executionMode: dto.executionMode ?? 'auto',
        waitingStep: dto.executionMode && dto.executionMode !== 'auto' ? 'extract' : null,
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
                targetLang: dto.targetLang,
                executionMode: dto.executionMode ?? 'auto',
                voiceModelVersion: dto.voiceModelVersion,
                dhModelVersion: dto.dhModelVersion,
                speakerId: dto.speakerId,
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

  /** 手动/单步模式：用户点击"执行下一步"放行暂停的任务（清除 waitingStep） */
  async advance(userId: number, id: number): Promise<OralWorkshopJobItem> {
    const job = await this.jobRepo.findOne({ where: { id, userId } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') {
      throw new BadRequestException(`任务已结束（${job.status}），无法继续推进`);
    }
    if (job.executionMode === 'auto') {
      throw new BadRequestException('自动模式任务无需手动推进');
    }
    job.waitingStep = null;
    await this.jobRepo.save(job);
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
    const rows = await this.jobRepo.find({
      where: [{ status: 'pending' }, { status: 'processing' }],
      order: { createdAt: 'ASC' },
      take: Math.max(limit * 3, limit),
    });
    // 手动/单步模式下等待用户放行（waitingStep 非空）的任务不自动执行
    const executable = rows.filter((j) => j.executionMode === 'auto' || !j.waitingStep);
    return executable.slice(0, limit);
  }

  /** 供执行器取某任务下一个待执行步骤名（无则 null） */
  async nextPendingStepOf(jobId: number): Promise<string | null> {
    const job = await this.jobRepo.findOne({ where: { id: jobId } });
    // 手动/单步模式暂停中：不返回待执行步骤，直到用户"执行下一步"放行
    if (job && job.executionMode !== 'auto' && job.waitingStep) return null;
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
    // 档位积分：voiceClone 步骤产出 credits_cost（基础+配音档+数字人档），结算与展示按实际值
    if (stepName === 'voiceClone' && resultJson && typeof resultJson.credits_cost === 'number' && resultJson.credits_cost > 0) {
      job.creditsCost = Math.round(resultJson.credits_cost);
    }
    await this.syncJobProgress(job, next);
    // 手动/单步模式：每完成一步暂停，等待用户"执行下一步"放行；任务结束则清除等待标记
    if (job.executionMode !== 'auto') {
      if (job.status !== 'done' && job.status !== 'failed') {
        const pending = nextPendingStep(next);
        job.waitingStep = pending ? pending.step : null;
      } else {
        job.waitingStep = null;
      }
      await this.jobRepo.save(job);
    }
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
      voiceSpeakerId: job.voiceSpeakerId ?? null,
      templateId: job.templateId ?? null,
      videoUrl: job.videoUrl ?? null,
      audioUrl: job.audioUrl ?? null,
      coverUrl: job.coverUrl ?? null,
      coverH1: job.coverH1 ?? null,
      coverH2: job.coverH2 ?? null,
      coverConfig: job.coverConfig ?? null,
      creditsCost: job.creditsCost,
      bilingual: !!job.bilingual,
      targetLang: job.targetLang ?? null,
      executionMode: job.executionMode ?? 'auto',
      waitingStep: job.waitingStep ?? null,
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

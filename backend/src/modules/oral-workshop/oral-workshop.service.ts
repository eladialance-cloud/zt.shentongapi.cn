import { Injectable, Logger, NotFoundException, BadRequestException, OnModuleInit, Optional, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, IsNull } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { OralWorkshopJobEntity, OralWorkshopJobStatus } from './entities/oral-workshop-job.entity';
import { OralWorkshopStepEntity } from './entities/oral-workshop-step.entity';
import { DigitalHumanAssetEntity } from './entities/digital-human-asset.entity';
import { PublishAccountEntity } from './entities/publish-account.entity';
import { PublishPlatformEntity } from './entities/publish-platform.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { OralWorkshopLlmService } from './llm';
import type { TopicItem } from './llm';
import { CreditsBillingService } from '../credits/services/credits-billing.service';
import { PublishService } from '../channel/services/publish.service';
import { SystemLlmService } from './system-llm.service';
import { VoiceCloneAdapter } from './adapters/voice.adapter';
import { HeyGenAdapter, type HeyGenAvatarItem } from './adapters/heygen.adapter';
import { SystemConfigEntity } from '../admin-system/entities/system-config.entity';
import { MediaAssetEntity } from '../media-assets/entities/media-asset.entity';
import { MediaAssetService } from '../media-assets/services/media-asset.service';
import { MaterialSearchService } from '../media-assets/services/material-search.service';
import { defaultFfmpegRunner, downloadTo, assertPublicMediaUrl, looksLikeHtml, resolveDirectMediaUrl } from './ffmpeg';
import { BatchCreateOralWorkshopJobsDto, CreateOralWorkshopJobDto, OralWorkshopJobQueryDto } from './dto/oral-workshop.dto';
import { listTemplates as listTemplatesLoader, toTemplateMeta, type OralWorkshopTemplateMeta } from './template-loader';
import { deriveTitle } from './compose-inputs';
import { deriveTopicTags } from './publisher';
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

/** IP 大脑档案返回项（对标 aigc-human ip-brain） */
export interface IpArchiveItem {
  id: number;
  userId: number;
  url: string;
  title: string | null;
  styleAnalysis: string | null;
  topics: string[];
  sourceJson: unknown;
  createdAt: Date;
}

/** yt-dlp 解析出的作品元数据条目 */
export interface IpArchiveSourceEntry {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  uploader?: string;
  view_count?: number;
}


export interface OralWorkshopJobItem {
  id: number;
  status: OralWorkshopJobStatus;
  currentStep: string | null;
  scriptInput: string | null;
  rewrittenScript: string | null;
  persona: string | null;
  style: string | null;
  targetAudience: string | null;
  goal: string | null;
  voiceSpeechRate: number | null;
  voiceLoudnessRate: number | null;
  voiceEmotion: string | null;
  bgmUrl: string | null;
  bgmVolume: number | null;
  pipAssets: Array<{ url: string; position: string; scale: number; startSec?: number; endSec?: number }> | null;
  /** D6：数字人生成方式 */
  dhGenerationMode: string | null;
  /** D3：多镜头（解析后的数组） */
  shots: Array<{ digitalHumanId: number; seconds: number }> | null;
  /** E7：字幕轨开关 */
  subtitlesEnabled: boolean;
  /** E7：BGM 轨开关 */
  bgmEnabled: boolean;
  publishStatus: string | null;
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
    @InjectRepository(DigitalHumanAssetEntity)
    private readonly dhAssetRepo: Repository<DigitalHumanAssetEntity>,
    @InjectRepository(PublishAccountEntity)
    private readonly accountRepo: Repository<PublishAccountEntity>,
    
    @InjectRepository(PublishPlatformEntity)
    private readonly platformRepo: Repository<PublishPlatformEntity>,
    private readonly billing: CreditsBillingService,
    private readonly llm: OralWorkshopLlmService,
    private readonly systemLlm: SystemLlmService,
    @Optional() private readonly encryption?: EncryptionService,
    @Optional() @InjectRepository(SystemConfigEntity)
    private readonly configRepo?: Repository<SystemConfigEntity>,
    @Optional() private readonly publishService?: PublishService,
    @Optional() @Inject(forwardRef(() => MaterialSearchService))
    private readonly materialSearch?: MaterialSearchService,
    @Optional() @InjectRepository(MediaAssetEntity)
    private readonly mediaAssetRepo?: Repository<MediaAssetEntity>,
    @Optional() @Inject(forwardRef(() => MediaAssetService))
    private readonly mediaAssetService?: MediaAssetService,
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
    let target = String(videoUrl ?? '').trim();
    if (!/^https?:\/\//i.test(target)) {
      // A3：支持粘贴分享口令/文本，自动识别其中的链接（优先抖音/快手/B站短链）
      const extracted = target.match(/https?:\/\/[^\s"'<>，。！？]+/i)?.[0];
      if (extracted) {
        target = extracted.trim();
      } else {
        throw new BadRequestException('请输入有效的视频链接（http/https），或粘贴含链接的分享文本');
      }
    }
    let videoUrlSafe = target;
    if (!/^https?:\/\//i.test(videoUrlSafe)) {
      throw new BadRequestException('请输入有效的视频链接（http/https）');
    }
    try {
      await assertPublicMediaUrl(videoUrlSafe);
    } catch (err) {
      throw new BadRequestException('视频链接不可访问: ' + (err as Error).message);
    }
    const dir = path.join(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads', 'oral-workshop', 'extract', String(userId), String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const extMatch = videoUrl.match(/\.(mp4|mov|avi|mkv|flv|webm|mp3|m4a|wav|aac)(\?|$)/i);
    const videoPath = path.join(dir, 'source' + (extMatch ? '.' + extMatch[1].toLowerCase() : '.mp4'));

    // 1) 下载内容（媒体直链直接作为源文件；网页链接先下载探测）
    try {
      await downloadTo(videoUrlSafe, videoPath);
    } catch (err) {
      throw new BadRequestException('对标视频下载失败: ' + (err as Error).message);
    }

    // 2) 下载结果是网页（HTML）→ 尝试 yt-dlp 解析真实媒体直链后重新下载
    if (looksLikeHtml(this.readFileHead(videoPath))) {
      try {
        const direct = await resolveDirectMediaUrl(videoUrlSafe);
        await downloadTo(direct, videoPath);
      } catch (err) {
        const raw = (err as Error).message || '';
        let hint = '可直接粘贴 .mp4/.mov 等视频直链，或在服务器升级 yt-dlp（standalone 二进制）后重试';
        if (/Unsupported URL|Unsupported webpage|Unsupported site|no longer exists|unsupported url/i.test(raw)) {
          hint = '该平台链接暂不支持自动解析（yt-dlp 不支持此网站，如微信视频号）。请将视频下载到本地后使用「上传文件提取文案」，或改用抖音/快手/B站/西瓜视频等支持平台的链接';
        } else if (/ENOENT|No such file|not found/i.test(raw)) {
          hint = '服务器未安装 yt-dlp，请安装 standalone 二进制后重试（https://github.com/yt-dlp/yt-dlp/releases/latest）';
        }
        throw new BadRequestException('该链接是网页而非视频文件直链，自动解析失败: ' + raw + '。' + hint);
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
  async getWorkshopMeta(userId?: number): Promise<{
    voicePool: Array<{ speakerId: string; name?: string; resourceId?: string }>;
    pricing: { baseCredits: number; voiceV1: number; voiceV2: number; dhV1: number; dhV2: number };
    personaPresets: Array<{ label: string; value: string }>;
    bgmLibrary: Array<{ id: string; name: string; url: string; category?: string }>;
    recentJob?: { id: number; videoUrl: string | null; coverUrl: string | null; status: string };
  }> {
    const voicePool = await this.getVoicePool();
    const pricing = { baseCredits: 5, voiceV1: 0, voiceV2: 0, dhV1: 0, dhV2: 0 };
    const personaPresets: Array<{ label: string; value: string }> = [
      { label: '老板型 IP', value: '老板型IP：有格局、敢说真话，讲经营/行业真相' },
      { label: '避坑顾问型', value: '避坑顾问型IP：专业、务实，专注帮用户避坑' },
      { label: '知识干货型', value: '知识干货型IP：严谨专业，输出方法论与清单' },
      { label: '故事经验型', value: '故事经验型IP：以亲身经历切入，讲故事讲复盘' },
      { label: '轻松育娃型', value: '轻松育娃型IP：亲切温暖，分享育儿实操经验' },
    ];
    const bgmLibrary: Array<{ id: string; name: string; url: string; category?: string }> = [];
    if (this.configRepo) {
      try {
        const row = await this.configRepo.findOne({ where: { section: 'oral_workshop' } });
        const cfg = (row?.configValue ?? {}) as Record<string, unknown>;
        const numOf = (k: string, fb: number): number => {
          const v = cfg[k];
          return typeof v === 'number' && v >= 0 ? Math.round(v) : fb;
        };
        pricing.baseCredits = numOf('baseCredits', 5);
        if (Array.isArray(cfg.personaPresets)) {
          const list: Array<{ label: string; value: string }> = [];
          for (const item of cfg.personaPresets) {
            if (item && typeof item === 'object') {
              const r = item as Record<string, unknown>;
              if (typeof r.label === 'string' && typeof r.value === 'string' && r.value.trim()) {
                list.push({ label: r.label, value: r.value });
              }
            }
          }
          if (list.length) personaPresets.splice(0, personaPresets.length, ...list);
        }
        if (Array.isArray(cfg.bgmLibrary)) {
          const list: Array<{ id: string; name: string; url: string; category?: string }> = [];
          for (const item of cfg.bgmLibrary) {
            if (item && typeof item === 'object') {
              const r = item as Record<string, unknown>;
              if (typeof r.name === 'string' && typeof r.url === 'string' && r.url.trim()) {
                list.push({
                  id: String(r.id ?? r.name + '-' + list.length),
                  name: r.name,
                  url: r.url,
                  category: typeof r.category === 'string' ? r.category : undefined,
                });
              }
            }
          }
          bgmLibrary.splice(0, bgmLibrary.length, ...list);
        }
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
    // F2：提交前预览参考——返回当前用户最近一条已完成的成片（若有）
    let recentJob: { id: number; videoUrl: string | null; coverUrl: string | null; status: string } | undefined;
    try {
      if (userId != null) {
        const done = await this.jobRepo
          .find({ where: { userId, status: 'done' }, order: { createdAt: 'DESC' }, take: 1 })
          .catch(() => []);
        if (done.length && done[0].videoUrl) {
          recentJob = { id: done[0].id, videoUrl: done[0].videoUrl ?? null, coverUrl: done[0].coverUrl ?? null, status: done[0].status };
        }
      }
    } catch {
      /* 预览为可选能力，失败不阻塞 */
    }
    return { voicePool, pricing, personaPresets, bgmLibrary, recentJob };
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
        style: dto.style ?? null,
        targetAudience: dto.targetAudience ?? null,
        goal: dto.goal ?? null,
        voiceSpeechRate: dto.voiceSpeechRate != null ? String(dto.voiceSpeechRate) : null,
        voiceLoudnessRate: dto.voiceLoudnessRate != null ? String(dto.voiceLoudnessRate) : null,
        voiceEmotion: dto.voiceEmotion ?? null,
        bgmUrl: dto.bgmUrl ?? null,
        bgmVolume: dto.bgmVolume != null ? String(dto.bgmVolume) : null,
        pipAssets: this.normalizePipAssets(dto.pipAssets),
        dhGenerationMode: dto.dhGenerationMode ?? 'auto',
        shots: this.normalizeShots(dto.shots),
        subtitlesEnabled: dto.subtitlesEnabled ?? true,
        bgmEnabled: dto.bgmEnabled ?? true,
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
                platforms: dto.platforms,
                persona: dto.persona,
                style: dto.style,
                targetAudience: dto.targetAudience,
                goal: dto.goal,
                voiceSpeechRate: dto.voiceSpeechRate,
                voiceLoudnessRate: dto.voiceLoudnessRate,
                voiceEmotion: dto.voiceEmotion,
                bgmUrl: dto.bgmUrl,
                bgmVolume: dto.bgmVolume,
                pipAssets: dto.pipAssets,
                dhGenerationMode: dto.dhGenerationMode,
                subtitlesEnabled: dto.subtitlesEnabled,
                bgmEnabled: dto.bgmEnabled,
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
    const where: Record<string, unknown> = { userId, deletedAt: IsNull() };
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

  /** 智能改写：AI 改写口播文案（A4：选模板/字数/参考范文，不计费） */
  async rewrite(
    userId: number,
    dto: { script: string; templateId?: string; wordCount?: number; persona?: string; style?: string; reference?: string },
  ): Promise<{ text: string; template_id: string; word_count: number }> {
    if (!dto.script?.trim()) throw new BadRequestException('缺少待改写文案');
    if (!this.llm) throw new BadRequestException('AI 服务未配置');
    try {
      const text = await this.llm.rewriteScript(dto.script.trim(), {
        persona: dto.persona?.trim() || undefined,
        style: dto.style?.trim() || undefined,
        templateId: dto.templateId,
        wordCount: dto.wordCount,
        reference: dto.reference?.trim() || undefined,
      });
      if (!text?.trim()) throw new Error('改写结果为空');
      return { text, template_id: dto.templateId || 'rewrite_master', word_count: dto.wordCount ?? 260 };
    } catch (err) {
      throw new BadRequestException('改写失败: ' + (err as Error).message);
    }
  }

  /** 产品/营销文案：产品名称/卖点 → 口播文案（A5，至少填一项，不计费） */
  async productCopy(
    userId: number,
    dto: { productName?: string; sellingPoints?: string; persona?: string; style?: string },
  ): Promise<{ text: string }> {
    const productInfo = [dto.productName?.trim(), dto.sellingPoints?.trim()].filter(Boolean).join('\n');
    if (!productInfo) throw new BadRequestException('请至少填写产品名称或产品卖点');
    if (!this.llm) throw new BadRequestException('AI 服务未配置');
    try {
      const text = await this.llm.createProductCopy(
        productInfo,
        dto.persona?.trim() || undefined,
        dto.style?.trim() || undefined,
      );
      if (!text?.trim()) throw new Error('生成内容为空');
      return { text };
    } catch (err) {
      throw new BadRequestException('产品文案生成失败: ' + (err as Error).message);
    }
  }

  // ===== 我的声音资产（对标参考软件"声音克隆/训练/预览"） =====

  /** 我的声音列表（P3 合并：voice_assets → media_assets，biz_type='voice_asset'，专有字段存 meta） */
  async listVoices(userId: number): Promise<Array<{ id: number; name: string; refAudioUrl: string; speakerId: string | null; demoAudio: string | null; emotionRefAudio: string | null; status: string; createdAt: Date }>> {
    if (!this.mediaAssetRepo) return [];
    const rows = await this.mediaAssetRepo.find({ where: { userId, bizType: 'voice_asset' }, order: { createdAt: 'DESC' } });
    return rows.map((r) => {
      const meta = (r.meta ?? {}) as Record<string, unknown>;
      return {
        id: r.id,
        name: r.title,
        refAudioUrl: r.url,
        speakerId: (meta.speakerId as string | undefined) ?? null,
        demoAudio: (meta.demoAudio as string | undefined) ?? null,
        emotionRefAudio: (meta.emotionRefAudio as string | undefined) ?? null,
        status: (meta.status as string | undefined) ?? 'ready',
        createdAt: r.createdAt,
      };
    });
  }

  /** 新增声音（参考音频 URL；创建后后台异步克隆回填 speaker_id/demo_audio，对标参考软件「声音训练/预览」） */
  async createVoice(userId: number, dto: { name: string; refAudioUrl: string; emotionRefAudio?: string }): Promise<{ id: number; name: string; refAudioUrl: string; status: string }> {
    if (!dto.name?.trim() || !dto.refAudioUrl?.trim()) {
      throw new BadRequestException('声音名称与参考音频 URL 不能为空');
    }
    if (!this.mediaAssetRepo) throw new BadRequestException('声音资产存储未初始化');
    const entity = this.mediaAssetRepo.create({
      userId,
      bizType: 'voice_asset',
      sourceType: 'manual',
      title: dto.name.trim().slice(0, 128),
      assetType: 'audio',
      url: dto.refAudioUrl.trim().slice(0, 512),
      meta: {
        kind: 'voice_asset',
        speakerId: null,
        demoAudio: null,
        emotionRefAudio: dto.emotionRefAudio?.trim()?.slice(0, 512) || null,
        status: 'training',
      },
      vectorStatus: 'none',
      archived: false,
    } as unknown as MediaAssetEntity);
    const saved = await this.mediaAssetRepo.save(entity);
    void this.cloneVoiceInBackground(saved);
    const savedMeta = (saved.meta ?? {}) as Record<string, unknown>;
    return { id: saved.id, name: saved.title, refAudioUrl: saved.url, status: (savedMeta.status as string | undefined) ?? 'training' };
  }

  /** 后台异步克隆：火山声音复刻 → 回填 speaker_id / demo_audio / status（失败置 failed，不阻塞建声音） */
  private async cloneVoiceInBackground(asset: MediaAssetEntity): Promise<void> {
    if (!this.mediaAssetRepo) return;
    try {
      let apiKey = process.env.VOLCANO_ARK_API_KEY || '';
      let cloneEndpoint = process.env.VOLCANO_VOICE_CLONE_ENDPOINT || '';
      if (this.configRepo) {
        const row = await this.configRepo.findOne({ where: { section: 'oral_workshop' } });
        const cfg = (row?.configValue ?? {}) as Record<string, unknown>;
        apiKey = String(cfg.voiceApiKey || cfg.volcanoApiKey || apiKey || '');
        cloneEndpoint = String(cfg.voiceCloneEndpoint || cloneEndpoint || '');
      }
      if (!apiKey) throw new Error('未配置火山语音技术 API Key（请在管理后台-口播工坊-火山方舟配置 填写）');
      const adapter = new VoiceCloneAdapter({
        apiKey,
        cloneEndpoint: cloneEndpoint || undefined,
        resourceId: 'seed-icl-2.0',
      });
      const meta = (asset.meta ?? {}) as Record<string, unknown>;
      const res = await adapter.cloneSpeaker({
        refAudioUrl: asset.url,
        emotionRefAudio: typeof meta.emotionRefAudio === 'string' ? meta.emotionRefAudio : undefined,
        text: '你好',
        userId: asset.userId,
      });
      asset.meta = {
        ...meta,
        speakerId: res.speakerId,
        demoAudio: res.demoAudio ?? null,
        status: 'ready',
      };
      await this.mediaAssetRepo.save(asset);
      this.logger.log('[oral-workshop] 声音 ' + asset.id + ' 克隆完成（speaker=' + res.speakerId + '）');
    } catch (err) {
      const meta = (asset.meta ?? {}) as Record<string, unknown>;
      asset.meta = { ...meta, status: 'failed' };
      await this.mediaAssetRepo.save(asset).catch(() => undefined);
      this.logger.error('[oral-workshop] 声音 ' + asset.id + ' 克隆失败: ' + (err as Error).message);
    }
  }

  /** 删除声音 */
  async deleteVoice(userId: number, id: number): Promise<void> {
    if (!this.mediaAssetRepo) throw new NotFoundException('声音不存在');
    const row = await this.mediaAssetRepo.findOne({ where: { id, userId, bizType: 'voice_asset' } });
    if (!row) throw new NotFoundException('声音不存在');
    await this.mediaAssetRepo.remove(row);
  }

  // ===== 我的数字人形象（对标参考软件"形象库/授权状态"） =====

  /** 我的形象列表 */
  async listDigitalHumans(userId: number): Promise<
    Array<{
      id: number;
      name: string;
      kind: 'cloud' | 'video' | 'image' | 'avatar';
      cloudId: string;
      videoUrl: string | null;
      imageUrl: string | null;
      previewUrl: string | null;
      description: string | null;
      authorized: boolean;
      status: string;
      createdAt: Date;
    }>
  > {
    const rows = await this.dhAssetRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind ?? 'cloud',
      cloudId: r.cloudId,
      videoUrl: r.videoUrl ?? null,
      imageUrl: r.imageUrl ?? null,
      previewUrl: r.previewUrl ?? null,
      description: r.description ?? null,
      authorized: r.authorized,
      status: r.status,
      createdAt: r.createdAt,
    }));
  }

  /** 新增形象（cloudId=火山数字人形象 ID） */
  async createDigitalHuman(
    userId: number,
    dto: { name: string; kind?: 'cloud' | 'video' | 'image'; cloudId?: string; videoUrl?: string; imageUrl?: string; previewUrl?: string; description?: string },
  ): Promise<{ id: number; name: string; kind: 'cloud' | 'video' | 'image'; cloudId: string; videoUrl: string | null; imageUrl: string | null; description: string | null; authorized: boolean }> {
    const kind = dto.kind === 'video' || dto.kind === 'image' ? dto.kind : 'cloud';
    if (!dto.name?.trim()) throw new BadRequestException('形象名称不能为空');
    if (kind === 'video') {
      if (!dto.videoUrl?.trim()) throw new BadRequestException('视频形象需要 videoUrl（请使用上传接口或填写转码后的 MP4 链接）');
    } else if (kind === 'image') {
      if (!dto.imageUrl?.trim()) throw new BadRequestException('图片形象需要 imageUrl（HeyGen talking photo 公网图片链接）');
      if (!/^https?:\/\//.test(dto.imageUrl.trim())) throw new BadRequestException('图片形象需要公网 URL（http/https，供 HeyGen 拉取）');
    } else if (!dto.cloudId?.trim()) {
      throw new BadRequestException('形象名称与形象 ID 不能为空');
    }
    const entity = this.dhAssetRepo.create({
      userId,
      name: dto.name.trim().slice(0, 128),
      kind,
      cloudId: kind === 'video' ? 'local-video-' + Date.now() : kind === 'image' ? 'heygen-image-' + Date.now() : dto.cloudId!.trim().slice(0, 128),
      videoUrl: kind === 'video' ? dto.videoUrl!.trim().slice(0, 512) : null,
      imageUrl: kind === 'image' ? dto.imageUrl!.trim().slice(0, 512) : null,
      previewUrl: dto.previewUrl?.trim().slice(0, 512) ?? null,
      description: dto.description?.trim().slice(0, 512) ?? null,
      authorized: true,
      status: 'ready',
    });
    const saved = await this.dhAssetRepo.save(entity);
    return {
      id: saved.id,
      name: saved.name,
      kind: saved.kind as 'cloud' | 'video' | 'image',
      cloudId: saved.cloudId,
      videoUrl: saved.videoUrl ?? null,
      imageUrl: saved.imageUrl ?? null,
      description: saved.description ?? null,
      authorized: saved.authorized,
    };
  }

  /** 删除形象 */
  async deleteDigitalHuman(userId: number, id: number): Promise<void> {
    const row = await this.dhAssetRepo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('形象不存在');
    await this.dhAssetRepo.remove(row);
  }

  /** HeyGen 官方预置形象列表（读管理后台 heygen 配置；未配置返回 configured=false，前端引导配置） */
  async listHeygenAvatars(): Promise<{ configured: boolean; avatars: HeyGenAvatarItem[]; message?: string }> {
    let apiKey = '';
    let endpoint = 'https://api.heygen.com';
    if (this.configRepo) {
      try {
        const row = await this.configRepo.findOne({ where: { section: 'oral_workshop' } });
        const cfg = (row?.configValue ?? {}) as Record<string, unknown>;
        if (typeof cfg.heygenApiKey === 'string' && cfg.heygenApiKey.trim()) apiKey = cfg.heygenApiKey.trim();
        if (typeof cfg.heygenEndpoint === 'string' && cfg.heygenEndpoint.trim()) endpoint = cfg.heygenEndpoint.trim();
      } catch (err) {
        this.logger.warn('[oral-workshop] 读取 HeyGen 配置失败: ' + (err as Error).message);
      }
    }
    if (!apiKey) apiKey = process.env.HEYGEN_API_KEY || '';
    if (!apiKey) return { configured: false, avatars: [] };
    try {
      const adapter = new HeyGenAdapter({ endpoint, apiKey });
      const avatars = await adapter.listAvatars();
      return { configured: true, avatars };
    } catch (err) {
      return { configured: true, avatars: [], message: (err as Error).message };
    }
  }

  /**
   * D2：上传真人视频建形象——ffmpeg 转码（MP4/H.264/≤1080P）+ 取首帧作预览 → 注册 kind=video 形象条目。
   * 返回预览图 URL 与形象条目（video_url=转码后产物）。
   */
  async uploadDigitalHumanVideo(
    userId: number,
    file: Express.Multer.File,
  ): Promise<{ id: number; name: string; kind: 'video'; cloudId: string; videoUrl: string; previewUrl: string; description: string | null; authorized: boolean }> {
    if (!file) throw new BadRequestException('请上传视频文件（字段名 file）');
    if (file.size > 500 * 1024 * 1024) throw new BadRequestException('视频文件不能超过 500MB');
    const uploadsRoot = path.resolve(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads');
    const dir = path.join(uploadsRoot, 'oral-workshop', 'dh-upload', String(userId), String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const rawPath = path.join(dir, 'raw' + path.extname(file.originalname || '.mp4').toLowerCase());
    fs.writeFileSync(rawPath, file.buffer);
    const videoPath = path.join(dir, 'avatar.mp4');
    const previewPath = path.join(dir, 'preview.jpg');
    try {
      // 转码：H.264 + yuv420p，高度 ≤1080（等比）
      await defaultFfmpegRunner(
        [
          'ffmpeg', '-y', '-i', rawPath,
          '-vf', 'scale=-2:min(1080\,ih)',
          '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
          '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
          '-an', videoPath,
        ],
        dir,
      );
      // 取首帧预览
      await defaultFfmpegRunner(
        ['ffmpeg', '-y', '-i', videoPath, '-ss', '0.05', '-frames:v', '1', '-q:v', '3', previewPath],
        dir,
      );
    } catch (err) {
      throw new BadRequestException('视频转码失败（请确保是有效视频文件）: ' + (err as Error).message);
    }
    const rel = (p: string) => path.relative(uploadsRoot, p).replace(/\\/g, '/');
    const videoUrl = '/uploads/' + rel(videoPath);
    const previewUrl = '/uploads/' + rel(previewPath);
    const entity = this.dhAssetRepo.create({
      userId,
      name: (path.parse(file.originalname || '本地视频形象').name || '本地视频形象').slice(0, 128),
      kind: 'video',
      cloudId: 'local-video-' + Date.now(),
      videoUrl,
      previewUrl,
      description: '本地上传视频形象（转码 MP4，可用于多镜头/直接出片）',
      authorized: true,
      status: 'ready',
    });
    const saved = await this.dhAssetRepo.save(entity);
    return {
      id: saved.id,
      name: saved.name,
      kind: 'video',
      cloudId: saved.cloudId,
      videoUrl: saved.videoUrl!,
      previewUrl: saved.previewUrl!,
      description: saved.description ?? null,
      authorized: saved.authorized,
    };
  }

  /**
   * M4+：上传图片供 HeyGen talking photo 使用——保存到 uploads 并返回相对 URL（不建资产）。
   * 前端拿到 URL 后转公网绝对地址，再调 createDigitalHuman(kind='image') 建形象资产。
   */
  async uploadDigitalHumanImage(
    userId: number,
    file: Express.Multer.File,
  ): Promise<{ imageUrl: string; previewUrl: string; fileName: string }> {
    if (!file) throw new BadRequestException('请上传图片文件（字段名 file）');
    if (file.size > 20 * 1024 * 1024) throw new BadRequestException('图片文件不能超过 20MB');
    if (!/^image\//.test(file.mimetype)) throw new BadRequestException('仅支持图片文件（jpg/png/webp）');
    const uploadsRoot = path.resolve(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads');
    const dir = path.join(uploadsRoot, 'oral-workshop', 'dh-upload', String(userId), String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase().replace(/[^a-z0-9.]/g, '');
    const imagePath = path.join(dir, 'talking-photo' + (ext || '.jpg'));
    fs.writeFileSync(imagePath, file.buffer);
    const rel = path.relative(uploadsRoot, imagePath).replace(/\\/g, '/');
    return { imageUrl: '/uploads/' + rel, previewUrl: '/uploads/' + rel, fileName: file.originalname || 'talking-photo.jpg' };
  }

  // ===== 发布账号（G：桌面端扫码绑定 + 管理后台平台开关；对标 aigc-human platform_accounts） =====

  /** 默认平台清单（开关表未初始化时回退全量） */
  private readonly defaultPublishPlatforms: Array<{ platform: string; displayName: string; sortOrder: number; remark: string }> = [
    { platform: 'douyin', displayName: '抖音', sortOrder: 1, remark: '扫码登录绑定' },
    { platform: 'kuaishou', displayName: '快手', sortOrder: 2, remark: '扫码登录绑定' },
    { platform: 'xiaohongshu', displayName: '小红书', sortOrder: 3, remark: '扫码登录绑定；自动发布受限，建议手动' },
    { platform: 'bilibili', displayName: 'B站', sortOrder: 4, remark: '扫码/账号登录绑定' },
    { platform: 'xigua', displayName: '西瓜视频', sortOrder: 5, remark: '扫码登录绑定' },
    { platform: 'wx_channels', displayName: '蝴蝶号', sortOrder: 6, remark: '微信视频号，扫码登录绑定' },
  ];


  // ===== 发布包生成 / 画中画素材推荐 / IP 大脑档案 =====

  /** 生成发布标题/描述（AI 发布包，失败降级拼接；任务不存在/非本人抛 400） */
  async getPublishPackage(
    userId: number,
    jobId: number,
  ): Promise<{ title: string; subtitle: string; description: string; tags: string[] }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId } });
    if (!job) throw new BadRequestException('口播工坊任务不存在或不属于当前用户');
    const script = job.rewrittenScript || job.scriptInput || '';
    let ai: { title: string; subtitle: string; description: string; topic_tags: string[] } | null = null;
    if (this.llm && script.trim()) {
      try {
        ai = await this.llm.generatePublishPackage(script);
      } catch (err) {
        this.logger.warn(`[oral-workshop] AI 发布包生成失败，降级拼接: ${(err as Error).message}`);
      }
    }
    const fallback = deriveTitle(script);
    const title = ai?.title || fallback.h1 || '口播短视频';
    const subtitle = ai?.subtitle || fallback.h2 || '';
    const description =
      ai?.description ||
      [title, subtitle].filter(Boolean).concat([script.slice(0, 200)]).filter(Boolean).join('\n');
    const tags = ai?.topic_tags?.length ? ai.topic_tags : deriveTopicTags(script);
    return { title, subtitle, description, tags };
  }

  /** 画中画素材推荐：字幕逐条抽关键词 → 素材中心语义检索 → pipAssets 建议 */
  async mixSuggest(
    userId: number,
    jobId: number,
  ): Promise<
    Array<{
      subtitle: string;
      keyword: string;
      matched: Array<{ materialId: number; name: string; url: string; type: string; score: number }>;
      pipAssets: Array<{ url: string; position: 'tl' | 'tr' | 'bl' | 'br' | 'center'; scale: number }>;
    }>
  > {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId } });
    if (!job) throw new BadRequestException('口播工坊任务不存在或不属于当前用户');
    const subtitles = await this.loadSubtitleLines(job);
    const positions: Array<'tl' | 'tr' | 'bl' | 'br' | 'center'> = ['tl', 'tr', 'bl'];
    const out: Array<{
      subtitle: string;
      keyword: string;
      matched: Array<{ materialId: number; name: string; url: string; type: string; score: number }>;
      pipAssets: Array<{ url: string; position: 'tl' | 'tr' | 'bl' | 'br' | 'center'; scale: number }>;
    }> = [];
    for (const subtitle of subtitles.slice(0, 8)) {
      const keyword = await this.extractKeyword(subtitle);
      let matched: Array<{ materialId: number; name: string; url: string; type: string; score: number }> = [];
      if (this.materialSearch && keyword.trim()) {
        try {
          const hits = await this.materialSearch.search(userId, { q: keyword, topK: 3 });
          matched = hits.map((h) => ({
            materialId: Number(h.asset.id),
            name: h.asset.title,
            url: h.asset.url,
            type: h.asset.assetType,
            score: h.score,
          }));
        } catch (err) {
          this.logger.warn(`[oral-workshop] mixSuggest 素材检索失败（keyword=${keyword}）: ${(err as Error).message}`);
        }
      }
      const pipAssets = matched.slice(0, 3).map((m, i) => ({ url: m.url, position: positions[i], scale: 0.25 }));
      out.push({ subtitle, keyword, matched, pipAssets });
    }
    return out;
  }

  /** 读任务字幕：videoEdit/rewrite 步骤产物的 subtitles 数组，否则从文案切句 */
  private async loadSubtitleLines(job: OralWorkshopJobEntity): Promise<string[]> {
    const rows = await this.stepRepo.find({ where: { jobId: job.id } });
    const videoEdit = rows.find((r) => r.step === 'videoEdit')?.resultJson as Record<string, unknown> | undefined;
    if (videoEdit && Array.isArray(videoEdit.subtitles)) {
      const arr = (videoEdit.subtitles as unknown[])
        .map((s) => (s && typeof s === 'object' ? String((s as { text?: unknown }).text ?? '') : String(s ?? '')))
        .map((s) => s.trim())
        .filter((s) => s.length >= 2);
      if (arr.length) return arr;
    }
    const rewrite = rows.find((r) => r.step === 'rewrite')?.resultJson as Record<string, unknown> | undefined;
    const text = String(
      (rewrite && typeof rewrite.rewritten_script === 'string' ? rewrite.rewritten_script : '') ||
        job.rewrittenScript ||
        job.scriptInput ||
        '',
    );
    return text
      .split(/[。！？!?；;，,\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 4)
      .slice(0, 8);
  }

  /** 字幕 → 检索关键词：LLM 抽取（复用选题生成），失败/不可用取前 12 字符 */
  private async extractKeyword(subtitle: string): Promise<string> {
    const s = String(subtitle ?? '').trim();
    if (!s) return '';
    if (this.llm) {
      try {
        const topics = await this.llm.generateTopics(s.slice(0, 40), { count: 1 });
        const title = topics?.[0]?.title?.trim();
        if (title) return title.slice(0, 12);
      } catch (err) {
        this.logger.debug(`[oral-workshop] mixSuggest 关键词抽取失败，使用字幕前缀: ${(err as Error).message}`);
      }
    }
    return s.slice(0, 12);
  }

  /** IP 大脑：解析对标链接（yt-dlp）→ 风格分析 + 选题 → 存档（对标 aigc-human ip-brain） */
  async analyzeIpArchive(userId: number, url: string): Promise<IpArchiveItem> {
    if (!this.mediaAssetRepo) throw new BadRequestException('IP 大脑存储未初始化');
    let target = String(url ?? '').trim();
    const extracted = target.match(/https?:\/\/[^\s"'<>，。！？]+/i)?.[0];
    if (extracted) target = extracted.trim();
    if (!/^https?:\/\//i.test(target)) {
      throw new BadRequestException('请输入有效的作品/主页链接（http/https）');
    }
    try {
      await assertPublicMediaUrl(target);
    } catch (err) {
      throw new BadRequestException('链接不可访问: ' + (err as Error).message);
    }
    let entries: IpArchiveSourceEntry[] = [];
    try {
      entries = await this.fetchIpArchiveEntries(target);
    } catch (err) {
      const msg = (err as Error).message || String(err);
      const missingYtDlp = /ENOENT|spawn yt-dlp|未安装|not installed/i.test(msg);
      throw new BadRequestException(
        '对标内容解析失败' + (missingYtDlp ? '（服务器未安装 yt-dlp，请执行: pip3 install -U yt-dlp）' : '') + ': ' + msg,
      );
    }
    if (!entries.length) {
      throw new BadRequestException('未解析到任何作品，请检查链接是否为公开主页/合集/单视频');
    }
    const titles = entries.map((e) => e.title || e.url || '').filter(Boolean);
    const content = entries
      .map((e) => [e.title, e.description].filter(Boolean).join('\n'))
      .filter(Boolean)
      .join('\n')
      .slice(0, 4000);
    let styleAnalysis = '（风格分析未生成）';
    let topics: string[] = titles.slice(0, 5);
    if (this.llm && content) {
      try {
        const res = await this.llm.styleAnalysis(content);
        styleAnalysis = res.style_analysis;
        if (Array.isArray(res.topics) && res.topics.length) topics = res.topics;
      } catch (err) {
        this.logger.warn(`[oral-workshop] IP 大脑风格分析失败，使用标题兜底: ${(err as Error).message}`);
      }
    }
    const entity = this.mediaAssetRepo.create({
      userId,
      bizType: 'ip_archive',
      sourceType: 'manual',
      title: (titles[0] || target).slice(0, 255),
      assetType: 'file',
      url: target.slice(0, 512),
      meta: {
        kind: 'ip_archive',
        styleAnalysis,
        topics: JSON.stringify(topics),
        sourceJson: JSON.stringify(entries),
      },
      vectorStatus: 'none',
      archived: false,
    } as unknown as MediaAssetEntity);
    const saved = await this.mediaAssetRepo.save(entity);
    return this.toIpArchiveItem(saved);
  }

  /** 运行 yt-dlp 拉取作品元数据（主页/合集 flat-playlist 1-5；单视频 no-playlist 全量） */
  private fetchIpArchiveEntries(url: string): Promise<IpArchiveSourceEntry[]> {
    const bin = process.env.ORAL_WORKSHOP_YTDLP_PATH || 'yt-dlp';
    const playlistLike = /\/playlist\b|[\?&]list=|channel\/|\/@[^/]+\/videos/i.test(url);
    const args = playlistLike
      ? ['--flat-playlist', '--dump-json', '--playlist-items', '1-5', '--no-warnings', url]
      : ['--no-playlist', '--dump-json', '--no-warnings', url];
    return new Promise<IpArchiveSourceEntry[]>((resolve, reject) => {
      execFile(bin, args, { timeout: 60000, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
        if (err) {
          const code = (err as NodeJS.ErrnoException).code;
          reject(new Error(code === 'ENOENT' ? '未安装 yt-dlp（pip3 install -U yt-dlp）' : err.message || String(err)));
          return;
        }
        const entries: IpArchiveSourceEntry[] = String(stdout || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.startsWith('{'))
          .map((l) => {
            try {
              return JSON.parse(l) as Record<string, unknown>;
            } catch {
              return null;
            }
          })
          .filter((j): j is Record<string, unknown> => !!j)
          .slice(0, 8)
          .map((j) => ({
            id: typeof j.id === 'string' || typeof j.id === 'number' ? String(j.id) : undefined,
            title: typeof j.title === 'string' ? j.title : undefined,
            description: typeof j.description === 'string' ? j.description : undefined,
            url: typeof j.webpage_url === 'string' ? j.webpage_url : undefined,
            uploader: typeof j.uploader === 'string' ? j.uploader : undefined,
            view_count: typeof j.view_count === 'number' ? j.view_count : undefined,
          }));
        resolve(entries);
      });
    });
  }

  /** IP 大脑档案列表（按创建时间倒序） */
  async listIpArchives(userId: number): Promise<IpArchiveItem[]> {
    if (!this.mediaAssetRepo) return [];
    const rows = await this.mediaAssetRepo.find({ where: { userId, bizType: 'ip_archive' }, order: { createdAt: 'DESC' } });
    return rows.map((r) => this.toIpArchiveItem(r));
  }

  /** 删除 IP 大脑档案 */
  async deleteIpArchive(userId: number, id: number): Promise<void> {
    if (!this.mediaAssetRepo) throw new NotFoundException('IP 大脑档案不存在');
    const row = await this.mediaAssetRepo.findOne({ where: { id, userId, bizType: 'ip_archive' } });
    if (!row) throw new NotFoundException('IP 大脑档案不存在');
    await this.mediaAssetRepo.remove(row);
  }

  /** 档案实体 → API 返回对象（解析 topics/sourceJson） */
  private toIpArchiveItem(r: MediaAssetEntity): IpArchiveItem {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    let topics: string[] = [];
    try {
      const parsed = JSON.parse(typeof meta.topics === 'string' ? meta.topics : '[]');
      if (Array.isArray(parsed)) topics = parsed.map(String);
    } catch {
      topics = [];
    }
    let sourceJson: unknown = [];
    try {
      sourceJson = JSON.parse(typeof meta.sourceJson === 'string' ? meta.sourceJson : '[]');
    } catch {
      sourceJson = [];
    }
    return {
      id: r.id,
      userId: r.userId,
      url: r.url,
      title: r.title ?? null,
      styleAnalysis: typeof meta.styleAnalysis === 'string' ? meta.styleAnalysis : null,
      topics,
      sourceJson,
      createdAt: r.createdAt,
    };
  }


  /** 平台探测主页（test-login 用 cookie 请求该地址判断登录态） */
  private readonly platformProbeUrls: Record<string, string> = {
    douyin: 'https://www.douyin.com/',
    kuaishou: 'https://cp.kuaishou.com/',
    xiaohongshu: 'https://creator.xiaohongshu.com/',
    bilibili: 'https://member.bilibili.com/',
    xigua: 'https://creator.xigua.com/',
    wx_channels: 'https://channels.weixin.qq.com/',
  };

  /** 平台开关列表（管理后台配置；无表则回退默认全量） */
  async listPublishPlatforms(): Promise<Array<{ platform: string; displayName: string; enabled: boolean; sortOrder: number; remark?: string | null }>> {
    try {
      if (this.platformRepo) {
        const rows = await this.platformRepo.find({ order: { sortOrder: 'ASC' } });
        if (rows.length) {
          return rows.map((r) => ({ platform: r.platform, displayName: r.displayName, enabled: !!r.enabled, sortOrder: r.sortOrder, remark: r.remark ?? null }));
        }
      }
    } catch (err) {
      this.logger.warn('[oral-workshop] 读取平台开关失败: ' + (err as Error).message);
    }
    return this.defaultPublishPlatforms.map((p) => ({ ...p, enabled: true }));
  }

  /** 启用的平台（桌面端账号页/发布面板只用启用平台） */
  async getEnabledPublishPlatforms(): Promise<Array<{ platform: string; displayName: string; sortOrder: number }>> {
    const list = await this.listPublishPlatforms();
    return list
      .filter((p) => p.enabled)
      .map(({ platform, displayName, sortOrder }) => ({ platform, displayName, sortOrder }));
  }

  /** 保存平台开关（管理后台） */
  async savePublishPlatforms(
    items: Array<{ platform: string; displayName: string; enabled: boolean; sortOrder: number; remark?: string }>,
  ): Promise<{ ok: boolean; updated: number }> {
    if (!this.platformRepo) throw new BadRequestException('平台开关表未初始化');
    const valid = this.defaultPublishPlatforms.map((p) => p.platform);
    const toSave = (items ?? []).filter((it) => it && typeof it === 'object' && valid.includes(it.platform));
    if (!toSave.length) throw new BadRequestException('平台开关列表不能为空');
    let updated = 0;
    for (const it of toSave) {
      let row = await this.platformRepo.findOne({ where: { platform: it.platform } });
      if (!row) {
        row = this.platformRepo.create({
          platform: it.platform,
          displayName: it.displayName || it.platform,
          enabled: !!it.enabled,
          sortOrder: it.sortOrder ?? 0,
          remark: it.remark ?? null,
        });
      } else {
        row.displayName = it.displayName || row.displayName;
        row.enabled = !!it.enabled;
        row.sortOrder = it.sortOrder ?? row.sortOrder;
        if (it.remark !== undefined) row.remark = it.remark ?? null;
      }
      await this.platformRepo.save(row);
      updated += 1;
    }
    return { ok: true, updated };
  }

  /** 账号列表（脱敏：不返回 cookies 明文） */
  async listPublishAccounts(userId: number): Promise<PublishAccountEntity[]> {
    const list = await this.accountRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
    return list.map((a) => {
      const plain = { ...a } as Partial<PublishAccountEntity>;
      delete (plain as Record<string, unknown>).cookies;
      return plain as PublishAccountEntity;
    });
  }

  /** 添加账号（扫码前先占位：pending + offline；绑定由桌面端扫码后调 session 接口完成） */
  async createPublishAccount(
    userId: number,
    dto: { platform: string; accountName: string; avatarUrl?: string; remark?: string },
  ): Promise<PublishAccountEntity> {
    if (!dto.platform?.trim() || !dto.accountName?.trim()) {
      throw new BadRequestException('平台与账号昵称不能为空');
    }
    const platform = dto.platform.trim().toLowerCase();
    const enabled = await this.getEnabledPublishPlatforms();
    if (!enabled.some((p) => p.platform === platform)) {
      throw new BadRequestException('平台未开放或不存在：' + platform);
    }
    const entity = this.accountRepo.create({
      userId,
      platform,
      accountName: dto.accountName.trim().slice(0, 128),
      avatarUrl: dto.avatarUrl?.trim().slice(0, 512) || null,
      remark: dto.remark?.trim().slice(0, 255) || null,
      status: 'pending',
      loginStatus: 'offline',
    });
    return this.accountRepo.save(entity);
  }

  /** 扫码登录成功后回填登录态（桌面端采集 cookies → 加密上传） */
  async saveAccountSession(
    userId: number,
    accountId: number,
    dto: { cookiesJson: string; displayName?: string; expiresAt?: string },
  ): Promise<PublishAccountEntity> {
    if (!dto?.cookiesJson?.trim()) throw new BadRequestException('缺少登录态 cookies');
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('发布账号不存在');
    account.cookies = this.encryption ? this.encryption.encryptAes(dto.cookiesJson.slice(0, 6000)) : dto.cookiesJson.slice(0, 6000);
    account.status = 'active';
    account.loginStatus = 'online';
    account.boundAt = new Date();
    account.lastLoginAt = new Date();
    if (dto.displayName?.trim()) account.displayName = dto.displayName.trim().slice(0, 128);
    const saved = await this.accountRepo.save(account);
    delete (saved as unknown as Record<string, unknown>).cookies;
    return saved;
  }

  /** 测试连接：用 cookie 探测平台登录态（对标 account:test-login） */
  async testAccountLogin(userId: number, accountId: number): Promise<{ loginStatus: 'online' | 'expired'; detail: string }> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('发布账号不存在');
    if (!account.cookies) throw new BadRequestException('该账号尚未登录，请先扫码绑定');
    let plain = '';
    try {
      plain = this.encryption ? this.encryption.decryptAes(account.cookies) : account.cookies;
    } catch {
      plain = account.cookies;
    }
    const probeUrl = this.platformProbeUrls[account.platform] || 'https://www.douyin.com/';
    let online = false;
    let detail = '请求失败';
    try {
      const res = await fetch(probeUrl, {
        headers: {
          Cookie: plain,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(12000),
      });
      detail = 'HTTP ' + res.status;
      online = res.status >= 200 && res.status < 400 && res.status !== 302;
      if (res.status === 302) {
        const loc = res.headers.get('location') || '';
        online = !/login|passport|sso/i.test(loc);
      }
    } catch (err) {
      detail = (err as Error).message;
    }
    account.loginStatus = online ? 'online' : 'expired';
    if (online) account.lastLoginAt = new Date();
    await this.accountRepo.save(account);
    return { loginStatus: account.loginStatus, detail };
  }

  /** 绑定发布账号（旧版模拟授权：待授权 → 已绑定；桌面端新版扫码走 session 接口） */
  async bindPublishAccount(userId: number, accountId: number): Promise<PublishAccountEntity> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('发布账号不存在');
    account.status = 'active';
    if (!account.boundAt) account.boundAt = new Date();
    const saved = await this.accountRepo.save(account);
    delete (saved as unknown as Record<string, unknown>).cookies;
    return saved;
  }
  /** 解绑：清空登录态（cookies 置空） */
  async clearAccountSession(userId: number, accountId: number): Promise<PublishAccountEntity> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('发布账号不存在');
    account.cookies = null;
    account.loginStatus = 'offline';
    account.status = 'pending';
    const saved = await this.accountRepo.save(account);
    delete (saved as unknown as Record<string, unknown>).cookies;
    return saved;
  }

  /** 删除账号 */
  async deletePublishAccount(userId: number, accountId: number): Promise<void> {
    const account = await this.accountRepo.findOne({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundException('发布账号不存在');
        await this.accountRepo.remove(account);
  }

  /** 任务产物一键导入素材库（P4：成片/封面/人声轨 → media_assets，幂等） */
  async importJobMaterials(userId: number, jobId: number): Promise<{ imported: number; list: Array<{ assetType: string; url: string; title: string }> }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId, deletedAt: IsNull() } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    const items: Array<{ url: string; title: string; assetType: 'image' | 'video' | 'audio' | 'file' }> = [];
    const add = (url: string | null | undefined, title: string, assetType: 'image' | 'video' | 'audio' | 'file'): void => {
      if (!url) return;
      const ext = (url.split('?')[0] || '').split('.').pop()?.toLowerCase() || '';
      const byExt: Record<string, 'image' | 'video' | 'audio'> = {
        png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image',
        mp4: 'video', mov: 'video', webm: 'video', m4v: 'video',
        mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio',
      };
      const finalType = byExt[ext] ?? assetType;
      items.push({ url, title, assetType: finalType });
    };
    add(job.videoUrl, '口播成片', 'video');
    add(job.coverUrl, '封面图', 'image');
    add(job.audioUrl, '人声轨', 'audio');
    const stepRows = await this.stepRepo.find({ where: { jobId } });
    for (const step of stepRows) {
      const rj = (step?.resultJson ?? {}) as Record<string, unknown>;
      if (step.step === 'voiceClone' && typeof rj.audio_path === 'string') add(rj.audio_path, '克隆音色音频', 'audio');
      if (step.step === 'videoEdit' && typeof rj.video_url === 'string') add(rj.video_url, '成片视频', 'video');
      if (step.step === 'titleCover' && typeof rj.cover_url === 'string') add(rj.cover_url, '封面图', 'image');
    }
    const seen = new Set<string>();
    const unique = items.filter((it) => (seen.has(it.url) ? false : (seen.add(it.url), true)));
    if (!unique.length) return { imported: 0, list: [] };
    if (!this.mediaAssetService) throw new BadRequestException('素材库服务未配置');
    const list: Array<{ assetType: string; url: string; title: string }> = [];
    let imported = 0;
    for (const it of unique) {
      if (this.mediaAssetRepo) {
        const exists = await this.mediaAssetRepo.findOne({ where: { userId, url: it.url } as never });
        if (exists) continue;
      }
      try {
        const asset = await this.mediaAssetService.create(userId, {
          title: it.title,
          url: it.url,
          assetType: it.assetType,
          description: '口播工坊任务 ' + jobId + ' 产物导入',
          tags: ['口播工坊'],
        } as never);
        list.push({ assetType: it.assetType, url: it.url, title: it.title });
        imported += 1;
        void this.materialSearch?.vectorizeAsset(userId, asset.id).catch(() => undefined);
      } catch (err) {
        this.logger.warn(`[oral-workshop] 素材导入失败 job=${jobId} url=${it.url}: ${(err as Error).message}`);
      }
    }
    return { imported, list };
  }

  /** G5：任务发布到账号（多账号批量 / 直接发布或保存草稿；对标 529 发布面板） */
  async publishJobToAccounts(
    userId: number,
    jobId: number,
    dto: { accountIds: number[]; mode?: 'manual' | 'auto' | 'draft'; title?: string; description?: string },
  ): Promise<{ planId: number; publishStatus: string; summary: string; results: Array<{ accountId: number; platform: string; status: string }> }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId, deletedAt: IsNull() } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    if (job.status !== 'done') throw new BadRequestException('仅已完成任务可发布');
    const ids = Array.isArray(dto?.accountIds) ? dto.accountIds.filter((v) => Number.isInteger(v) && v > 0) : [];
    if (!ids.length) throw new BadRequestException('请选择至少一个发布账号');
    const accounts = await this.accountRepo.find({ where: { id: In(ids), userId } });
    if (accounts.length !== ids.length) throw new BadRequestException('存在无效的发布账号');
    const inactive = accounts.find((a) => a.status !== 'active' || a.loginStatus !== 'online');
    if (inactive) throw new BadRequestException('账号未登录或已过期：' + (inactive.displayName || inactive.accountName));
    if (!this.publishService) throw new BadRequestException('发布服务未配置');

    const mode = dto.mode === 'draft' ? 'draft' : 'manual';
    const packageData = {
      title: dto.title?.trim() || job.coverH1 || '深瞳AI 口播成片',
      content: dto.description?.trim() || job.rewrittenScript || job.scriptInput || '',
      mediaUrls: [job.videoUrl || job.coverUrl].filter(Boolean) as string[],
      targetPlatforms: accounts.map((a) => a.platform),
    };
    let planId = job.publishPlanId ?? 0;
    if (planId) {
      try {
        await this.publishService.updatePlan(userId, planId, { ...packageData, mode: 'manual' });
      } catch {
        planId = 0;
      }
    }
    if (!planId) {
      const plan = await this.publishService.createPlan(userId, { ...packageData, mode: 'manual', taskId: job.id });
      planId = plan.id;
      job.publishPlanId = planId;
      await this.jobRepo.save(job);
    }
    await this.publishService.setAccounts(userId, planId, ids);
    let plan = mode === 'draft' ? await this.publishService.saveAsDraft(userId, planId) : await this.publishService.markPublishing(userId, planId);
    const results = ids.map((id) => {
      const acc = accounts.find((a) => a.id === id)!;
      return { accountId: id, platform: acc.platform, status: plan.publishStatus ?? 'publishing' };
    });
    let summary = '发布任务已创建（手动发布：请在桌面端完成平台发布）';
    if (mode === 'draft') summary = '已保存为草稿（未发布）';
    else if (plan.publishStatus === 'failed') summary = '全部发布失败';
    else if (plan.publishStatus === 'partial') summary = '部分发布成功';
    return { planId, publishStatus: plan.publishStatus ?? 'publishing', summary, results };
  }

  /** G5：发布结果回写（桌面端完成手动/自动发布后回调） */
  async writePublishResult(
    userId: number,
    planId: number,
    dto: { results: Array<{ accountId: number; platform: string; status: 'success' | 'failed'; message?: string }> },
  ): Promise<{ publishStatus: string; summary: string }> {
    if (!this.publishService) throw new BadRequestException('发布服务未配置');
    const results = Array.isArray(dto?.results) ? dto.results : [];
    if (!results.length) throw new BadRequestException('缺少发布结果');
    const okCount = results.filter((r) => r.status === 'success').length;
    const failCount = results.length - okCount;
    let publishStatus: 'success' | 'failed' | 'partial' = okCount === results.length ? 'success' : failCount === results.length ? 'failed' : 'partial';
    const summary =
      publishStatus === 'success' ? '全部发布成功！共 ' + okCount + ' 个账号' : publishStatus === 'failed' ? '全部发布失败！共 ' + failCount + ' 个账号' : '部分发布成功：成功 ' + okCount + ' 个，失败 ' + failCount + ' 个';
    await this.publishService.markPublished(userId, planId, publishStatus, summary, results);
    return { publishStatus, summary };
  }

  /** 兼容旧调用（单账号发布 → 走新接口） */
  async publishJobToAccount(userId: number, jobId: number, dto: { accountId: number }): Promise<{ planId: number; publishStatus: string }> {
    const r = await this.publishJobToAccounts(userId, jobId, { accountIds: [dto.accountId] });
    return { planId: r.planId, publishStatus: r.publishStatus };
  }

  // ===== 选题灵感（对标参考软件"爆款选题/关键词选题"） =====

  /** 选题生成：关键词 + 人设 → 5 个选题（LLM，失败返回可读错误） */
  async generateTopics(userId: number, dto: { keywords: string; persona?: string; count?: number; excludedTopics?: string[]; industryOrProduct?: string; productSellingPoints?: string }): Promise<TopicItem[]> {
    if (!dto.keywords?.trim()) throw new BadRequestException('请输入选题关键词');
    try {
      return await this.llm.generateTopics(dto.keywords.trim(), {
        persona: dto.persona?.trim() || undefined,
        count: Math.min(Math.max(dto.count ?? 5, 1), 10),
        excludedTopics: dto.excludedTopics?.map((s) => s.trim()).filter(Boolean) ?? undefined,
        industryOrProduct: dto.industryOrProduct?.trim() || undefined,
        productSellingPoints: dto.productSellingPoints?.trim() || undefined,
      });
    } catch (err) {
      throw new BadRequestException('选题生成失败: ' + (err as Error).message);
    }
  }

  /** 对标账号风格分析：参考内容 → style_analysis + 5 条选题（对标参考软件「风格分析」） */
  async styleAnalysis(
    userId: number,
    dto: { referenceContent: string; excludedTopics?: string[] },
  ): Promise<{ style_analysis: string; topics: TopicItem[] }> {
    const content = dto.referenceContent?.trim();
    if (!content) throw new BadRequestException('请提供对标内容');
    if (!this.llm) throw new BadRequestException('AI 服务未配置');
    try {
      const res = await this.llm.styleAnalysis(content, dto.excludedTopics ?? []);
      return { style_analysis: res.style_analysis, topics: res.topics.map((title) => ({ title })) };
    } catch (err) {
      throw new BadRequestException('风格分析失败: ' + (err as Error).message);
    }
  }

  /** 选题 → 口播文案生成（对标参考软件：选题灵感选中后自动扩写完整口播文案，AI 生成，不计费） */
  async generateScript(userId: number, dto: { topic: string; persona?: string; reference?: string; style?: string }): Promise<{ text: string }> {
    if (!dto.topic?.trim()) throw new BadRequestException('缺少选题');
    if (!this.llm) throw new BadRequestException('AI 服务未配置');
    try {
      const text = await this.llm.createScript(dto.topic.trim(), dto.reference?.trim() || undefined, dto.persona?.trim() || undefined, dto.style?.trim() || undefined);
      if (!text?.trim()) throw new Error('生成内容为空');
      return { text };
    } catch (err) {
      throw new BadRequestException('文案生成失败: ' + (err as Error).message);
    }
  }

  /** 可用模板列表（工作台选择用，返回轻量元数据） */
  async listTemplates(): Promise<OralWorkshopTemplateMeta[]> {
    return listTemplatesLoader().map((t) => toTemplateMeta(t));
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
        // 实际成本：voiceClone 已写 credits_cost 用实际值；否则按管理后台单价估算（基础+配音档+数字人档）
        let actual = job.creditsCost > 0 ? job.creditsCost : DEFAULT_ESTIMATED_CREDITS;
        if (job.creditsCost <= 0) {
          actual = await this.estimateCredits({
            voiceModelVersion: job.voiceModelVersion ?? undefined,
            dhModelVersion: job.dhModelVersion ?? undefined,
          });
        }
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
    if (typeof resultJson.title_h1 === 'string' && resultJson.title_h1.trim()) job.coverH1 = resultJson.title_h1.trim();
    if (typeof resultJson.title_h2 === 'string' && resultJson.title_h2.trim()) job.coverH2 = resultJson.title_h2.trim();
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

  /** F3：任务统计概览（总数/进行中/已完成/失败，不含已删除） */
  async jobStats(userId: number): Promise<{
    total: number;
    pending: number;
    processing: number;
    done: number;
    failed: number;
    cancelled: number;
  }> {
    const rows = await this.jobRepo.find({
      where: { userId, deletedAt: IsNull() },
      select: ['status'],
    });
    const count = { total: rows.length, pending: 0, processing: 0, done: 0, failed: 0, cancelled: 0 };
    for (const r of rows) {
      if (r.status === 'pending') count.pending += 1;
      else if (r.status === 'processing') count.processing += 1;
      else if (r.status === 'done') count.done += 1;
      else if (r.status === 'failed') count.failed += 1;
      else if (r.status === 'cancelled') count.cancelled += 1;
    }
    return count;
  }

  /** F3：重试失败任务——重置非完成步骤为 pending，重新预扣 Credits（旧冻结已退款）并重新入队 */
  async retryJob(userId: number, jobId: number): Promise<OralWorkshopJobItem> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId, deletedAt: IsNull() } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    if (job.status !== 'failed') throw new BadRequestException('仅失败任务可重试');
    const steps = await this.loadSteps(jobId);
    await this.stepRepo.save(
      steps.map((s) =>
        this.toStepEntity(
          {
            ...s,
            status: s.status === 'done' ? s.status : 'pending',
            resultJson: s.status === 'done' ? s.resultJson : undefined,
            error: s.status === 'done' ? s.error : undefined,
            retryCount: 0,
          },
          true,
        ),
      ),
    );
    let frozenTxnId: number | null = null;
    try {
      const estimatedCost = await this.estimateCredits({
        voiceModelVersion: job.voiceModelVersion ?? undefined,
        dhModelVersion: job.dhModelVersion ?? undefined,
      });
      const frozen = await this.billing.estimateAndFreeze(
        userId,
        'oral_workshop',
        'ow-retry-' + job.id + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
        estimatedCost,
      );
      frozenTxnId = frozen.id;
    } catch (err) {
      throw new BadRequestException('重试预扣 Credits 失败: ' + (err as Error).message);
    }
    job.status = 'pending';
    job.error = null;
    job.currentStep = null;
    job.frozenTxnId = frozenTxnId;
    await this.jobRepo.save(job);
    return this.get(userId, jobId);
  }

  /** F3：删除任务（软删除，列表/详情不再返回） */
  async deleteJob(userId: number, jobId: number): Promise<{ ok: boolean }> {
    const job = await this.jobRepo.findOne({ where: { id: jobId, userId, deletedAt: IsNull() } });
    if (!job) throw new NotFoundException('口播工坊任务不存在');
    job.deletedAt = new Date();
    await this.jobRepo.save(job);
    return { ok: true };
  }

  /** A3：上传本地音视频文件 → ffmpeg 抽音频 → STT（复用学习对标链路，不计费） */
  async extractFile(userId: number, file: Express.Multer.File): Promise<{ text: string }> {
    if (!file) throw new BadRequestException('请上传音视频文件');
    const dir = path.join(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads', 'oral-workshop', 'extract', String(userId), String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const extMatch = (file.originalname || '').match(/\.(mp4|mov|avi|mkv|flv|webm|mp3|m4a|wav|aac)$/i);
    const src = path.join(dir, 'source' + (extMatch ? '.' + extMatch[1].toLowerCase() : path.extname(file.originalname) || '.bin'));
    fs.writeFileSync(src, file.buffer);
    const audioPath = path.join(dir, 'audio.wav');
    try {
      await defaultFfmpegRunner(['ffmpeg', '-y', '-i', src, '-vn', '-ar', '16000', '-ac', '1', audioPath], dir);
    } catch (err) {
      const msg = (err as Error).message || String(err);
      throw new BadRequestException('音频提取失败（请上传可识别的 mp4/mov/mp3/m4a/wav 等音视频文件）: ' + msg);
    }
    try {
      const text = await this.systemLlm.stt(audioPath);
      return { text };
    } catch (err) {
      throw new BadRequestException('语音识别失败: ' + (err as Error).message);
    }
  }

  /** C2：裁剪参考音频/视频（sourceUrl + startSec/endSec → uploads 产物，返回可访问 URL） */
  async trimMedia(
    userId: number,
    body: { sourceUrl: string; startSec: number; endSec: number },
  ): Promise<{ url: string }> {
    const { sourceUrl, startSec, endSec } = body;
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      throw new BadRequestException('sourceUrl 必须是公网 http(s) 链接');
    }
    if (!(startSec >= 0) || !(endSec > startSec) || endSec - startSec > 300) {
      throw new BadRequestException('裁剪区间无效（0 ≤ start < end，最长 300 秒）');
    }
    try {
      await assertPublicMediaUrl(sourceUrl);
    } catch (err) {
      throw new BadRequestException('源地址不可访问: ' + (err as Error).message);
    }
    const dir = path.join(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads', 'oral-workshop', 'trim', String(userId), String(Date.now()));
    fs.mkdirSync(dir, { recursive: true });
    const src = path.join(dir, 'source' + (sourceUrl.match(/\.(mp4|mov|mp3|m4a|wav|aac)(\?|$)/i)?.[1] ? '.' + sourceUrl.match(/\.(mp4|mov|mp3|m4a|wav|aac)(\?|$)/i)![1].toLowerCase() : '.mp3'));
    await downloadTo(sourceUrl, src);
    const out = path.join(dir, 'trim.mp3');
    const dur = endSec - startSec;
    try {
      await defaultFfmpegRunner(
        ['ffmpeg', '-y', '-ss', String(startSec), '-i', src, '-t', String(dur), '-vn', '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-q:a', '5', out],
        dir,
      );
    } catch (err) {
      throw new BadRequestException('裁剪失败: ' + (err as Error).message);
    }
    const rel = path.relative(path.resolve(process.env.ORAL_WORKSHOP_UPLOADS_DIR || 'uploads'), out).replace(/\\/g, '/');
    return { url: '/uploads/' + rel };
  }

  /** F5：任务关联发布计划的发布状态（无计划返回 null） */
  private async resolvePublishStatus(job: OralWorkshopJobEntity): Promise<string | null> {
    if (!job.publishPlanId || !this.publishService) return null;
    try {
      const plan = await this.publishService.getPlan(job.userId, job.publishPlanId);
      return plan.publishStatus ?? 'unpublish';
    } catch {
      return null;
    }
  }

  /** 画中画素材归一化：过滤非法项 → JSON 字符串落库（P3 D4/E6） */
  private normalizePipAssets(
    pipAssets?: Array<{ url?: string; position?: string; scale?: number; startSec?: number; endSec?: number }>,
  ): string | null {
    if (!Array.isArray(pipAssets) || pipAssets.length === 0) return null;
    const POSITIONS = ['tl', 'tr', 'bl', 'br', 'center'];
    const items = pipAssets
      .filter((p) => p && typeof p === 'object' && typeof p.url === 'string' && p.url.trim())
      .slice(0, 4)
      .map((p) => ({
        url: p.url!.trim().slice(0, 512),
        position: p.position && POSITIONS.includes(p.position) ? p.position : 'br',
        scale:
          typeof p.scale === 'number' && p.scale >= 0.05 && p.scale <= 1
            ? Number(p.scale.toFixed(2))
            : 0.25,
        ...(typeof p.startSec === 'number' && p.startSec >= 0 ? { startSec: p.startSec } : {}),
        ...(typeof p.endSec === 'number' && p.endSec > (p.startSec || 0) ? { endSec: p.endSec } : {}),
      }));
    return items.length > 0 ? JSON.stringify(items) : null;
  }

  /** 解析画中画素材 JSON（详情/列表返回；执行器下载时复用） */
  parsePipAssets(raw?: string | null): Array<{ url: string; position: string; scale: number; startSec?: number; endSec?: number }> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed
        .filter((p) => p && typeof p === 'object' && typeof p.url === 'string')
        .map((p) => ({
          url: String(p.url),
          position: ['tl', 'tr', 'bl', 'br', 'center'].includes(p.position) ? p.position : 'br',
          scale: typeof p.scale === 'number' ? p.scale : 0.25,
          ...(typeof p.startSec === 'number' ? { startSec: p.startSec } : {}),
          ...(typeof p.endSec === 'number' ? { endSec: p.endSec } : {}),
        }));
    } catch {
      return null;
    }
  }

  /** 多镜头归一化：过滤非法项 → JSON 字符串落库（D3） */
  private normalizeShots(
    shots?: Array<{ digitalHumanId?: number; seconds?: number }>,
  ): string | null {
    if (!Array.isArray(shots) || shots.length === 0) return null;
    const items = shots
      .filter(
        (s) =>
          s &&
          typeof s === 'object' &&
          typeof s.digitalHumanId === 'number' &&
          Number.isInteger(s.digitalHumanId) &&
          s.digitalHumanId > 0 &&
          typeof s.seconds === 'number' &&
          s.seconds >= 2 &&
          s.seconds <= 120,
      )
      .slice(0, 6)
      .map((s) => ({ digitalHumanId: s.digitalHumanId!, seconds: Math.round(s.seconds!) }));
    return items.length > 0 ? JSON.stringify(items) : null;
  }

  /** 解析多镜头 JSON（详情/列表返回） */
  parseShots(raw?: string | null): Array<{ digitalHumanId: number; seconds: number }> | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed
        .filter(
          (s) =>
            s &&
            typeof s === 'object' &&
            typeof s.digitalHumanId === 'number' &&
            typeof s.seconds === 'number',
        )
        .map((s) => ({ digitalHumanId: Number(s.digitalHumanId), seconds: Math.round(Number(s.seconds)) }));
    } catch {
      return null;
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
      style: job.style ?? null,
      targetAudience: job.targetAudience ?? null,
      goal: job.goal ?? null,
      voiceSpeechRate: job.voiceSpeechRate != null ? Number(job.voiceSpeechRate) : null,
      voiceLoudnessRate: job.voiceLoudnessRate != null ? Number(job.voiceLoudnessRate) : null,
      voiceEmotion: job.voiceEmotion ?? null,
      bgmUrl: job.bgmUrl ?? null,
      bgmVolume: job.bgmVolume != null ? Number(job.bgmVolume) : null,
      pipAssets: this.parsePipAssets(job.pipAssets),
      dhGenerationMode: job.dhGenerationMode ?? 'auto',
      shots: this.parseShots(job.shots),
      subtitlesEnabled: job.subtitlesEnabled !== false,
      bgmEnabled: job.bgmEnabled !== false,
      publishStatus: await this.resolvePublishStatus(job),
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

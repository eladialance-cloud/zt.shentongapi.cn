/**
 * 口播工坊流水线执行器（M2-4 起逐步接入各步骤）
 *
 * 轮询 oral_workshop_jobs（pending/processing），按状态机推进当前 pending 步骤：
 *   extract（已接入）→ rewrite（已接入，LLM）→ voiceClone（已接入：火山克隆/本地 SAPI/用户音频）
 *   → digitalHuman（已接入：火山合成/本地卡片视频/用户视频）→ videoEdit（已接入，ffmpeg 合成）
 *   → titleCover（已接入，封面+标题）→ publishReady（已接入，终态）。
 * 引擎选择读取 system_config.oral_workshop（管理后台 M8-4），环境变量可覆盖：
 *   ORAL_WORKSHOP_VOICE_ENGINE / ORAL_WORKSHOP_DIGITAL_HUMAN_ENGINE = volcano|local|auto（默认 auto）
 *   auto：已配置火山密钥走火山，否则降级本地/上传素材，避免任务卡死。
 * 步骤执行通过 service.markStepRunning / markStepDone / markStepFailed 驱动。
 */
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCardVideoCommand, buildCoverCommand, buildShotConcatCommand, buildShotTrimCommand, composePlan, type FfmpegPlan } from './composer';
import { deriveTitle, ensureBadgeImage, segmentScript, segmentScriptBilingual, type TitlePair } from './compose-inputs';
import { loadTemplate } from './template-loader';
import { VoiceCloneAdapter } from './adapters/voice.adapter';
import { DigitalHumanAdapter } from './adapters/digital-human.adapter';
import { HeyGenAdapter } from './adapters/heygen.adapter';
import { sapiTts } from './local-tts';
import { SystemConfigEntity } from '../admin-system/entities/system-config.entity';
import { VoiceAssetEntity } from './entities/voice-asset.entity';
import { DigitalHumanAssetEntity } from './entities/digital-human-asset.entity';
import { OralWorkshopService } from './oral-workshop.service';
import { OralWorkshopLlmService } from './llm';
import type { OralWorkshopJobEntity } from './entities/oral-workshop-job.entity';
import { defaultFfmpegRunner, downloadTo, resolveLocalMediaPath, type FfmpegRunner } from './ffmpeg';

/** 引擎配置（管理后台 system_config.oral_workshop + 环境变量覆盖） */
export interface OralWorkshopEngineConfig {
  /** 声音引擎：volcano=火山方舟 / local=本地 SAPI / auto=自动降级 */
  voiceEngine: 'volcano' | 'local' | 'auto';
  /** 数字人引擎：volcano=火山方舟 / heygen=HeyGen 数字人 / local=本地卡片视频 / auto=自动降级 */
  digitalHumanEngine: 'volcano' | 'local' | 'auto' | 'heygen';
  /** 品牌水印开关（免费档叠加；AI 角标为合规强制，独立于此） */
  watermarkEnabled: boolean;
  /** 品牌水印文案 */
  watermarkText: string;
  /** 单轮并发任务上限（管理后台可配） */
  maxConcurrentJobs: number;
  /** E3：系统 BGM 库（管理后台维护，[{id,name,url,category}]，模板 auto_bgm 或任务未选时取第一条） */
  bgmLibrary: Array<{ id: string; name: string; url: string; category?: string }>;
  /** 火山方舟（云端）配置组：管理后台口播工坊-火山方舟配置，环境变量兜底 */
  volcano: {
    /** 火山方舟 API Key（LLM/声音克隆/数字人共用） */
    apiKey: string;
    /** 声音克隆 TTS 端点（默认 ark.cn-beijing.volces.com/api/v3） */
    voiceEndpoint: string;
    /** V1 档音色 ID（speaker，用户任务选 V1 时使用） */
    voiceModelV1: string;
    /** V2 档音色 ID（speaker，用户任务选 V2 时使用） */
    voiceModelV2: string;
    /** 旧版单一 TTS 模型 ID / 兜底音色（兼容） */
    voiceModel: string;
    /** 语音技术 X-Api-Key（独立于方舟 Key） */
    voiceApiKey: string;
    /** X-Api-Resource-Id：seed-tts-2.0 / seed-icl-2.0 */
    voiceResourceId: string;
    /** 声音复刻端点 */
    voiceCloneEndpoint: string;
    /** TTS 音频格式：mp3/pcm/ogg_opus/wav */
    voiceFormat: string;
    /** TTS 采样率 */
    voiceSampleRate: number;
    /** TTS 语速 -50..100 */
    voiceSpeechRate: number;
    /** TTS 音量 -50..100 */
    voiceLoudnessRate: number;
    /** TTS 字幕时间戳 */
    voiceEnableSubtitle: boolean;
    /** 默认参考音频 URL（用户未选"我的声音"时兜底） */
    voiceRefAudio: string;
    /** 已训练 speaker_id（优先复用，跳过克隆） */
    voiceSpeakerId: string;
    /** 数字人服务端点 */
    dhEndpoint: string;
    /** 数字人提交任务路径（默认 /digital-human/submit） */
    dhSubmitPath: string;
    /** 数字人查询任务路径（默认 /digital-human/query） */
    dhQueryPath: string;
    /** 数字人模型版本：V1=标准 / V2=高清 */
    dhModelVersion?: 'V1' | 'V2';
    /** 默认数字人形象 ID（用户未选"我的形象"时兜底） */
    dhDefaultImageId: string;
    /** 任务基础积分（文案/标题/封面等 LLM 步骤） */
    baseCredits: number;
    /** V1 档配音配置（resourceId+model+音色+参考音频+积分） */
    voiceTierV1: VoiceTierConfig;
    /** V2 档配音配置 */
    voiceTierV2: VoiceTierConfig;
    /** 数字人 V1/V2 档积分 */
    dhTierV1: { creditsCost: number };
    dhTierV2: { creditsCost: number };
    /** 官方音色池（管理后台维护，桌面端展示） */
    voicePool: Array<{ speakerId: string; name?: string; resourceId?: string }>;
  };
  /** HeyGen（M4+）配置组：替换火山数字人（第三方 SaaS，需公网音频 URL 与 API 套餐） */
  heygen: {
    /** HeyGen API Key（X-Api-Key，管理后台配置，环境变量 HEYGEN_API_KEY 兜底） */
    apiKey: string;
    /** API 端点（默认 https://api.heygen.com） */
    endpoint: string;
    /** 生成质量：720 / 1080（默认 1080） */
    quality: '720' | '1080';
    /** 默认预置形象 ID（用户未选形象时兜底） */
    defaultAvatarId: string;
  };
}

/** 单档配音配置（V1/V2 分别配对模型/音色/积分） */
export interface VoiceTierConfig {
  /** X-Api-Resource-Id：seed-tts-2.0（官方音色） / seed-icl-2.0（复刻音色） */
  resourceId: string;
  /** 可选模型（如 seed-tts-2.0-standard，留空=服务端默认） */
  model: string;
  /** 档位默认音色 ID */
  speakerId: string;
  /** 档位兜底参考音频 URL（无 speakerId 时克隆用） */
  refAudioUrl: string;
  /** 参考音频对应文本（复刻质量关键） */
  refAudioText: string;
  /** 本档配音积分单价 */
  creditsCost: number;
}

/** 当前已接入执行的步骤集合（其余步骤由对应里程碑落地后加入） */
const IMPLEMENTED_STEPS = new Set([
  'extract',
  'rewrite',
  'voiceClone',
  'digitalHuman',
  'videoEdit',
  'titleCover',
  'publishReady',
]);

/** 每轮最多处理的任务数 */
const BATCH_LIMIT = 5;

/** 引擎名归一化（非法值回退 fallback；voice 与 digitalHuman 共用） */
function normalizeEngine<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  const s = String(v ?? '').toLowerCase();
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

/** 从 URL/路径推断扩展名（无扩展名返回空串） */
function extnameOf(urlOrPath: string): string {
  const base = String(urlOrPath).split(/[?#]/)[0] || '';
  const m = /\.([a-zA-Z0-9]{1,8})$/.exec(base);
  return m ? '.' + m[1].toLowerCase() : '';
}

@Injectable()
export class OralWorkshopExecutor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OralWorkshopExecutor.name);
  private timer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    private readonly service: OralWorkshopService,
    private readonly llm: OralWorkshopLlmService,
    @Optional() private readonly runFfmpeg: FfmpegRunner = defaultFfmpegRunner,
    @Optional() @InjectRepository(SystemConfigEntity)
    private readonly configRepo?: Repository<SystemConfigEntity>,
    @Optional() @InjectRepository(VoiceAssetEntity)
    private readonly voiceAssetRepo?: Repository<VoiceAssetEntity>,
    @Optional() @InjectRepository(DigitalHumanAssetEntity)
    private readonly dhAssetRepo?: Repository<DigitalHumanAssetEntity>,
  ) {}

  onModuleInit(): void {
    if (process.env.ORAL_WORKSHOP_EXECUTOR_DISABLED === 'true') {
      this.logger.log('[oral-workshop] 执行器已通过环境变量禁用');
      return;
    }
    const intervalMs = Number(process.env.ORAL_WORKSHOP_EXECUTOR_INTERVAL_MS || 5000);
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    this.timer.unref?.();
    this.logger.log(`[oral-workshop] 执行器已启动（间隔 ${intervalMs}ms）`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** 单轮调度：防重入 */
  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      await this.processBatch();
    } catch (err) {
      this.logger.error(`[oral-workshop] 执行器调度异常: ${(err as Error).message}`);
    } finally {
      this.processing = false;
    }
  }

  /** 处理一批待执行任务，返回本批实际推进的步骤数 */
  async processBatch(): Promise<number> {
    const cfg = await this.readEngineConfig();
    const jobs = await this.service.findExecutableJobs(cfg.maxConcurrentJobs);
    let processed = 0;
    for (const job of jobs) {
      try {
        if (await this.processJob(job)) processed += 1;
      } catch (err) {
        this.logger.error(`[oral-workshop] 任务 ${job.id} 处理异常: ${(err as Error).message}`);
      }
    }
    return processed;
  }

  /** 推进单个任务：取下一个 pending 步骤；未实现步骤标记 done(skipped) 以推进流水线 */
  async processJob(job: OralWorkshopJobEntity): Promise<boolean> {
    const stepName = await this.service.nextPendingStepOf(job.id);
    if (!stepName) return false;
    if (!IMPLEMENTED_STEPS.has(stepName)) {
      this.logger.debug(`[oral-workshop] 任务 ${job.id} 步骤 ${stepName} 尚未接入执行器，标记跳过以推进流水线`);
      await this.service.markStepDone(job.id, stepName, {
        skipped: true,
        skip_reason: '步骤尚未接入当前版本执行器',
        skippedAt: new Date().toISOString(),
      });
      return true;
    }
    await this.service.markStepRunning(job.id, stepName);
    try {
      const result = await this.dispatch(stepName, job);
      await this.service.markStepDone(job.id, stepName, result);
      return true;
    } catch (err) {
      const msg = (err as Error).message || String(err);
      this.logger.error(`[oral-workshop] 任务 ${job.id} 步骤 ${stepName} 失败: ${msg}`);
      await this.service.markStepFailed(job.id, stepName, msg);
      return true;
    }
  }

  /** 步骤分发 */
  private async dispatch(stepName: string, job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    switch (stepName) {
      case 'extract':
        return this.runExtract(job);
      case 'rewrite':
        return this.runRewrite(job);
      case 'voiceClone':
        return this.runVoiceClone(job);
      case 'digitalHuman':
        return this.runDigitalHuman(job);
      case 'videoEdit':
        return this.runVideoEdit(job);
      case 'titleCover':
        return this.runTitleCover(job);
      case 'publishReady':
        return { ready: true, packagedAt: new Date().toISOString() };
      default:
        throw new Error(`步骤 ${stepName} 未实现`);
    }
  }

  private async runExtract(job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    const script = job.scriptInput ?? '';
    return { chars: Array.from(script).length };
  }

  private async runRewrite(job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    const script = job.scriptInput ?? '';
    // B4/B5：人设/风格/目标受众/创作目标统一注入改写（对标参考软件「改写模板+字数」）
    const styleParts = [job.style, job.goal ? '目标：' + job.goal : '', job.targetAudience ? '受众：' + job.targetAudience : '']
      .filter(Boolean)
      .join('；');
    const rewritten = await this.llm.rewriteScript(script, {
      persona: job.persona ?? undefined,
      style: styleParts || undefined,
      wordCount: 260,
    });
    return { rewritten_script: rewritten };
  }

  /** 档位积分成本：基础费 + 配音档价 + 数字人档价（管理后台可配，替换固定 21 分） */
  private creditsCostOf(config: OralWorkshopEngineConfig, job: OralWorkshopJobEntity): number {
    const base = config.volcano.baseCredits || 0;
    const vv = job.voiceModelVersion || 'V2';
    const vt = vv === 'V1' ? config.volcano.voiceTierV1 : config.volcano.voiceTierV2;
    const dv = job.dhModelVersion || 'V2';
    const dt = dv === 'V1' ? config.volcano.dhTierV1 : config.volcano.dhTierV2;
    return Math.max(base + (vt.creditsCost || 0) + (dt.creditsCost || 0), 1);
  }

  /**
   * voiceClone：人声轨产出（优先级：用户音频 → 火山克隆/TTS → 本地 SAPI 兜底）
   * 引擎选择读 system_config.oral_workshop（voiceEngine），环境变量可覆盖。
   */
  private async runVoiceClone(job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    const outputDir = this.outputDirFor(job);
    fs.mkdirSync(outputDir, { recursive: true });
    const script = job.rewrittenScript || job.scriptInput || '';
    const config = await this.readEngineConfig();
    const engine = config.voiceEngine;

    // 1) 用户提供成音：直接采用（不调 TTS）
    if (job.audioUrl) {
      const dest = path.join(outputDir, 'voice' + (extnameOf(job.audioUrl) || '.mp3'));
      await downloadTo(job.audioUrl, dest);
      this.logger.log(`[oral-workshop] 任务 ${job.id} voiceClone 采用用户音频`);
      return { audio_path: dest, source: 'uploaded', engine: 'upload', credits_cost: this.creditsCostOf(config, job) };
    }

    // 2) 火山方舟：声音复刻（参考音频）→ TTS
    const useVolcano = engine === 'volcano' || (engine === 'auto' && this.hasVolcanoVoice(config));
    if (useVolcano) {
      if (!this.hasVolcanoVoice(config)) {
        throw new Error('声音引擎配置为 volcano，但缺少火山方舟密钥 / TTS 模型（请在管理后台-口播工坊-火山方舟配置 填写）');
      }
      if (!script) throw new Error('voiceClone 缺少文案（rewrittenScript/scriptInput 为空）');
      // 档位化：V1/V2 分别配对 resourceId+model+音色+参考音频（管理后台 voiceTierV1/voiceTierV2）
      const voiceVersion: 'V1' | 'V2' = job.voiceModelVersion || 'V2';
      const tier = voiceVersion === 'V1' ? config.volcano.voiceTierV1 : config.volcano.voiceTierV2;
      // 优先级：任务级官方音色（音色池选择） > 我的声音资产 > 档位音色 > 全局兜底
      let refAudioUrl = tier.refAudioUrl || config.volcano.voiceRefAudio || process.env.ORAL_WORKSHOP_VOICE_REF_AUDIO || '';
      let speakerId =
        job.voiceSpeakerId ||
        tier.speakerId ||
        config.volcano.voiceSpeakerId ||
        process.env.ORAL_WORKSHOP_VOICE_SPEAKER_ID ||
        undefined;
      let resourceId = tier.resourceId || config.volcano.voiceResourceId || 'seed-icl-2.0';
      const model = tier.model || config.volcano.voiceModel || undefined;
      const refAudioText = tier.refAudioText || '';
      if (job.voiceId && this.voiceAssetRepo) {
        const asset = await this.voiceAssetRepo.findOne({ where: { id: job.voiceId, userId: job.userId } });
        if (asset) {
          refAudioUrl = asset.refAudioUrl;
          if (asset.speakerId && !job.voiceSpeakerId) speakerId = asset.speakerId;
        } else {
          throw new Error('声音资产不存在或不属于当前用户（voiceId=' + job.voiceId + '）');
        }
      }
      // 任务级官方音色：resourceId 取音色池条目（默认 seed-tts-2.0）
      if (job.voiceSpeakerId) {
        const poolVoice = config.volcano.voicePool.find((v) => v.speakerId === job.voiceSpeakerId);
        resourceId = poolVoice?.resourceId || 'seed-tts-2.0';
      }
      if (!refAudioUrl && !speakerId) {
        throw new Error('火山声音克隆未配置参考音频/音色（请先在管理后台配置 V1/V2 档音色或参考音频，或"我的声音"添加参考音频）');
      }
      const adapter = new VoiceCloneAdapter({
        endpoint: config.volcano.voiceEndpoint || undefined,
        cloneEndpoint: config.volcano.voiceCloneEndpoint || undefined,
        apiKey: config.volcano.voiceApiKey || config.volcano.apiKey,
        resourceId,
        model,
        format: config.volcano.voiceFormat || 'mp3',
        sampleRate: config.volcano.voiceSampleRate || 24000,
        speechRate: config.volcano.voiceSpeechRate ?? 0,
        loudnessRate: config.volcano.voiceLoudnessRate ?? 0,
        enableSubtitle: config.volcano.voiceEnableSubtitle,
        timeoutMs: Number(process.env.VOLCANO_REQUEST_TIMEOUT_MS || 60000),
      });
      const speedRatio = job.voiceSpeechRate != null ? Number(job.voiceSpeechRate) : Number(process.env.ORAL_WORKSHOP_VOICE_SPEED || 0.9);
      const loudnessRate = job.voiceLoudnessRate != null ? Math.round(Number(job.voiceLoudnessRate)) : undefined;
      const emotionText = job.voiceEmotion && job.voiceEmotion !== '无' ? job.voiceEmotion : (process.env.ORAL_WORKSHOP_VOICE_EMOTION_TEXT || undefined);
      const res = await adapter.generateVoice({
        refAudioUrl,
        refAudioText: refAudioText || script,
        text: script,
        speakerId,
        speedRatio,
        emotionText,
      });
      const ext = res.mimeType.includes('mp3') || res.mimeType.includes('mpeg') ? 'mp3' : 'wav';
      const dest = path.join(outputDir, 'voice.' + ext);
      fs.writeFileSync(dest, res.audioBuffer);
      // C4：用户级音量增益（-20~20）→ 合成后增益一次（适配器 loudness 走后台配置）
      if (loudnessRate !== undefined) {
        const gainPath = path.join(outputDir, 'voice.gain.mp3');
        await this.runFfmpeg(['ffmpeg', '-y', '-i', dest, '-af', 'volume=' + String(loudnessRate) + 'dB', '-c:a', 'libmp3lame', '-q:a', '4', gainPath], outputDir);
        fs.renameSync(gainPath, dest);
      }
      // 档位积分定价：基础 + 配音档 + 数字人档（结算时按 job.creditsCost）
      const dhCost = (job.dhModelVersion === 'V1' ? config.volcano.dhTierV1.creditsCost : config.volcano.dhTierV2.creditsCost) || 0;
      const tierCost = tier.creditsCost || 0;
      this.logger.log(
        `[oral-workshop] 任务 ${job.id} voiceClone 火山合成成功（speaker=${res.speakerId ?? '-'}，tier=${voiceVersion}，resource=${resourceId}，credits=${config.volcano.baseCredits + tierCost + dhCost}）`,
      );
      return {
        audio_path: dest,
        source: 'volcano',
        engine: 'volcano',
        speaker_id: res.speakerId ?? null,
        tier: voiceVersion,
        credits_cost: this.creditsCostOf(config, job),
      };
    }

    // 3) 本地降级：Windows SAPI TTS（零依赖；Linux 需配置火山或提供音频）
    const useLocal = engine === 'local' || (engine === 'auto' && !this.hasVolcanoVoice(config));
    if (useLocal) {
      if (!script) throw new Error('voiceClone 缺少文案（rewrittenScript/scriptInput 为空）');
      const dest = path.join(outputDir, 'voice.wav');
      await sapiTts(script, dest);
      this.logger.log(`[oral-workshop] 任务 ${job.id} voiceClone 本地 SAPI TTS 完成`);
      return { audio_path: dest, source: 'sapi', engine: 'local', credits_cost: this.creditsCostOf(config, job) };
    }

    throw new Error('声音引擎不可用：请配置火山（VOLCANO_ARK_API_KEY/VOLCANO_VOICE_MODEL + 参考音频）或提供 audioUrl');
  }

  /**
   * digitalHuman：数字人视频产出（优先级：用户视频 → HeyGen/火山合成 → 本地卡片视频兜底）
   * 本地兜底 = 静态背景 + 语音轨，字幕由 videoEdit 叠加（纯字幕口播视频，抖音常见形态）。
   */
  private async runDigitalHuman(job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    const outputDir = this.outputDirFor(job);
    fs.mkdirSync(outputDir, { recursive: true });
    const config = await this.readEngineConfig();
    const engine = config.digitalHumanEngine;
    const mode: 'auto' | 'cloud' | 'local' = job.dhGenerationMode || 'auto';
    const shots = this.service.parseShots(job.shots) ?? [];

    // 1) 用户提供数字人/绿幕视频
    if (job.videoUrl) {
      const dest = path.join(outputDir, 'human' + (extnameOf(job.videoUrl) || '.mp4'));
      await downloadTo(job.videoUrl, dest);
      this.logger.log(`[oral-workshop] 任务 ${job.id} digitalHuman 采用用户视频`);
      return { video_path: dest, source: 'uploaded', engine: 'upload' };
    }

    const results = await this.service.getStepResults(job.id);
    const voiceArtifact = results.voiceClone ?? {};
    const audioPath = String(voiceArtifact.audio_path || job.audioUrl || '');

    // D3：多镜头拼接（shots 数组长度 > 1 时走独立合成管线）
    if (shots.length > 1) {
      return this.runMultiShot(job, shots, mode, engine, config, outputDir);
    }

    // 2) HeyGen 数字人（M4+）：预置形象/talking photo 图片 + 公网音频 → 提交/轮询 → 下载成片
    let heygenSkipped = false;
    const useHeygen = mode === 'local'
      ? false
      : engine === 'heygen' || (engine === 'auto' && this.hasHeygen(config));
    if (useHeygen) {
      if (!this.hasHeygen(config)) {
        throw new Error('数字人引擎配置为 heygen，但缺少 HeyGen API Key（请在管理后台-口播工坊-HeyGen 配置 填写）');
      }
      if (!audioPath) throw new Error('数字人合成需要语音（voiceClone 产物 audio_path）');
      if (!/^https?:\/\//.test(audioPath)) {
        // HeyGen 为第三方 SaaS，无法拉取本地文件：auto 模式降级本地卡片视频，显式 heygen 才报错
        if (engine !== 'auto' || mode === 'cloud') {
          throw new Error('HeyGen 数字人要求音频为公网 URL（当前为本地文件，请先上传素材到公网）');
        }
        this.logger.warn(`[oral-workshop] 任务 ${job.id} HeyGen 数字人需要公网音频 URL，auto 降级本地卡片视频`);
        heygenSkipped = true;
      } else {
        // 形象：我的形象资产优先（kind=image → talking photo 图片；kind=avatar/cloud → 预置形象 ID）
        let imageUrl: string | undefined;
        let avatarId: string | undefined;
        if (job.digitalHumanId && this.dhAssetRepo) {
          const asset = await this.dhAssetRepo.findOne({ where: { id: job.digitalHumanId, userId: job.userId } });
          if (asset) {
            if (asset.kind === 'image' && asset.imageUrl) imageUrl = asset.imageUrl;
            else avatarId = asset.cloudId || undefined;
          } else {
            throw new Error('数字人形象不存在或不属于当前用户（digitalHumanId=' + job.digitalHumanId + '）');
          }
        }
        if (!imageUrl && !avatarId) avatarId = config.heygen.defaultAvatarId || undefined;
        if (!imageUrl && !avatarId) {
          throw new Error('未选择 HeyGen 形象（请选择预置形象/上传图片，或在管理后台配置默认形象）');
        }
        if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
          throw new Error('HeyGen talking photo 要求图片为公网 URL（当前为本地路径，请先上传到公网）');
        }
        const adapter = new HeyGenAdapter({
          endpoint: config.heygen.endpoint || 'https://api.heygen.com',
          apiKey: config.heygen.apiKey,
          quality: config.heygen.quality,
          pollIntervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 5000),
          maxAttempts: Number(process.env.HEYGEN_MAX_ATTEMPTS || 120),
          timeoutMs: Number(process.env.HEYGEN_REQUEST_TIMEOUT_MS || 60000),
        });
        const { videoUrl } = await adapter.generate({ audioUrl: audioPath, imageUrl, avatarId });
        const dest = path.join(outputDir, 'human.mp4');
        await downloadTo(videoUrl, dest);
        this.logger.log(`[oral-workshop] 任务 ${job.id} digitalHuman HeyGen 合成成功`);
        return { video_path: dest, video_url: videoUrl, source: 'heygen', engine: 'heygen' };
      }
    }

    // 3) 火山数字人：提交 + 轮询 → 下载成片
    let volcanoSkipped = false;
    const useVolcano = mode === 'local'
      ? false
      : mode === 'cloud' || engine === 'volcano' || (engine === 'auto' && this.hasVolcanoDigitalHuman(config));
    if (useVolcano) {
      if (!this.hasVolcanoDigitalHuman(config)) {
        const hint = this.hasHeygen(config)
          ? '检测到已配置 HeyGen，请将数字人引擎切换为 heygen（管理后台-口播工坊-数字人引擎），或在火山方舟配置补齐密钥/endpoint'
          : '请在管理后台-口播工坊-火山方舟配置 填写';
        throw new Error('数字人引擎配置为 volcano，但缺少火山方舟密钥 / 数字人 endpoint（' + hint + '）');
      }
      if (!audioPath) throw new Error('数字人合成需要语音（voiceClone 产物 audio_path）');
      if (!/^https?:\/\//.test(audioPath)) {
        // 本地合成音频没有公网 URL，火山无法拉取：auto 模式降级本地卡片视频，显式 volcano 才报错
        if (engine !== 'auto' || mode === 'cloud') {
          throw new Error('火山数字人要求音频为公网 URL（当前为本地文件，请先接入 OSS 上传或托管到公网）');
        }
        this.logger.warn(`[oral-workshop] 任务 ${job.id} 火山数字人需要公网音频 URL，auto 降级本地卡片视频`);
        volcanoSkipped = true;
      } else {
      // 我的形象资产（digitalHumanId）优先；其次环境变量形象 ID
      let digitalHumanId = String(config.volcano.dhDefaultImageId || process.env.ORAL_WORKSHOP_DIGITAL_HUMAN_ID || '');
      if (job.digitalHumanId && this.dhAssetRepo) {
        const asset = await this.dhAssetRepo.findOne({ where: { id: job.digitalHumanId, userId: job.userId } });
        if (asset) {
          digitalHumanId = asset.cloudId;
        } else {
          throw new Error('数字人形象不存在或不属于当前用户（digitalHumanId=' + job.digitalHumanId + '）');
        }
      }
      if (!digitalHumanId) throw new Error('未配置数字人形象（请先在"我的形象"添加或设置 ORAL_WORKSHOP_DIGITAL_HUMAN_ID）');
      const adapter = new DigitalHumanAdapter({
        endpoint: config.volcano.dhEndpoint,
        apiKey: config.volcano.apiKey,
        submitPath: config.volcano.dhSubmitPath,
        queryPath: config.volcano.dhQueryPath,
        modelVersion: job.dhModelVersion || config.volcano.dhModelVersion || 'V1',
        pollIntervalMs: Number(process.env.VOLCANO_DH_POLL_INTERVAL_MS || 3000),
        maxAttempts: Number(process.env.VOLCANO_DH_MAX_ATTEMPTS || 120),
        timeoutMs: Number(process.env.VOLCANO_REQUEST_TIMEOUT_MS || 60000),
      });
      const { videoUrl } = await adapter.generate({ audioUrl: audioPath, digitalHumanId });
      const dest = path.join(outputDir, 'human.mp4');
      await downloadTo(videoUrl, dest);
      this.logger.log(`[oral-workshop] 任务 ${job.id} digitalHuman 火山合成成功`);
      return { video_path: dest, video_url: videoUrl, source: 'volcano', engine: 'volcano' };
      }
    }

    // 4) 本地兜底：纯字幕卡片视频（模板背景色 + 语音轨）
    const useLocal = mode === 'local' || (!useVolcano && !useHeygen) || volcanoSkipped || heygenSkipped;
    if (useLocal) {
      if (!audioPath) throw new Error('本地数字人模式需要语音（voiceClone 产物 audio_path）');
      const template = loadTemplate(this.templateIdOf(job));
      const dest = path.join(outputDir, 'human.mp4');
      const cmd = buildCardVideoCommand({
        audioPath,
        outputPath: dest,
        width: template.project_settings.width,
        height: template.project_settings.height,
        fps: template.project_settings.fps,
        background: template.project_settings.background,
      });
      await this.runFfmpeg(cmd, outputDir);
      this.logger.log(`[oral-workshop] 任务 ${job.id} digitalHuman 本地卡片视频兜底完成`);
      return { video_path: dest, source: 'card', engine: 'local' };
    }

    throw new Error('数字人引擎不可用：请配置 HeyGen（HEYGEN_API_KEY）或火山（VOLCANO_ARK_API_KEY/VOLCANO_DIGITAL_HUMAN_ENDPOINT）或提供 videoUrl');
  }


  /**
   * D3：多镜头数字人合成（shots 数组长度 > 1 时使用）
   * 按 shots 顺序切分语音段，每个镜头用对应形象生成/裁剪视频，最后 concat 拼接 + 主语音轨。
   */
  private async runMultiShot(
    job: OralWorkshopJobEntity,
    shots: Array<{ digitalHumanId: number; seconds: number }>,
    mode: 'auto' | 'cloud' | 'local',
    engine: string,
    config: OralWorkshopEngineConfig,
    outputDir: string,
  ): Promise<Record<string, unknown>> {
    const results = await this.service.getStepResults(job.id);
    const voiceArtifact = results.voiceClone ?? {};
    const audioPath = String(voiceArtifact.audio_path || job.audioUrl || '');
    if (!audioPath) {
      throw new Error('多镜头数字人合成需要语音（voiceClone 产物 audio_path）');
    }
    const template = loadTemplate(this.templateIdOf(job));
    // HeyGen 多镜头暂不支持（分镜音频为本地文件，HeyGen 需公网 URL）：heygen 引擎降级本地卡片视频
    if (engine === 'heygen' || (engine === 'auto' && this.hasHeygen(config))) {
      this.logger.warn(`[oral-workshop] 任务 ${job.id} 多镜头模式暂不支持 HeyGen 云合成，降级本地卡片视频`);
    }
    const canCloud = engine === 'heygen'
      ? false
      : mode === 'cloud' || engine === 'volcano' || (mode === 'auto' && this.hasVolcanoDigitalHuman(config));
    const audioPublic = /^https?:\/\//.test(audioPath);
    const segments: string[] = [];
    let cursor = 0;
    const adapter = new DigitalHumanAdapter({
      endpoint: config.volcano.dhEndpoint,
      apiKey: config.volcano.apiKey,
      submitPath: config.volcano.dhSubmitPath,
      queryPath: config.volcano.dhQueryPath,
      modelVersion: job.dhModelVersion || config.volcano.dhModelVersion || 'V1',
      pollIntervalMs: Number(process.env.VOLCANO_DH_POLL_INTERVAL_MS || 3000),
      maxAttempts: Number(process.env.VOLCANO_DH_MAX_ATTEMPTS || 120),
      timeoutMs: Number(process.env.VOLCANO_REQUEST_TIMEOUT_MS || 60000),
    });
    for (let i = 0; i < shots.length; i++) {
      const seconds = Math.max(2, Math.round(shots[i].seconds || 0));
      const segAudio = path.join(outputDir, 'shot' + i + '.mp3');
      await this.runFfmpeg([
        'ffmpeg', '-y', '-ss', String(cursor), '-i', audioPath, '-t', String(seconds), '-vn',
        '-acodec', 'libmp3lame', '-q:a', '4', segAudio,
      ], outputDir);
      cursor += seconds;
      const asset = this.dhAssetRepo
        ? await this.dhAssetRepo.findOne({ where: { id: shots[i].digitalHumanId, userId: job.userId } })
        : null;
      if (!asset) {
        throw new Error('数字人形象不存在或不属于当前用户（digitalHumanId=' + shots[i].digitalHumanId + '）');
      }
      const segOut = path.join(outputDir, 'shot' + i + '.mp4');
      if (asset.kind === 'video' && asset.videoUrl) {
        const raw = path.join(outputDir, 'shot' + i + '-raw' + (extnameOf(asset.videoUrl) || '.mp4'));
        await downloadTo(asset.videoUrl, raw);
        await this.runFfmpeg(buildShotTrimCommand({ inputPath: raw, seconds, outputPath: segOut }), outputDir);
      } else if (canCloud && mode !== 'local') {
        if (!audioPublic) {
          if (mode !== 'auto') {
            throw new Error('火山数字人要求音频为公网 URL（当前为本地文件，请先接入 OSS 上传或托管到公网）');
          }
          this.logger.warn('[oral-workshop] 任务 ' + job.id + ' 镜头 ' + i + ' 火山数字人需要公网音频，降级本地卡片视频');
          await this.runFfmpeg(buildCardVideoCommand({
            audioPath: segAudio,
            outputPath: segOut,
            width: template.project_settings.width,
            height: template.project_settings.height,
            fps: template.project_settings.fps,
            background: template.project_settings.background,
          }), outputDir);
        } else {
          const { videoUrl } = await adapter.generate({ audioUrl: segAudio, digitalHumanId: String(asset.cloudId) });
          await downloadTo(videoUrl, segOut);
        }
      } else {
        await this.runFfmpeg(buildCardVideoCommand({
          audioPath: segAudio,
          outputPath: segOut,
          width: template.project_settings.width,
          height: template.project_settings.height,
          fps: template.project_settings.fps,
          background: template.project_settings.background,
        }), outputDir);
      }
      segments.push(segOut);
    }
    const listPath = path.join(outputDir, 'concat.txt');
    fs.writeFileSync(listPath, segments.map((s) => "file '" + s + "'").join('\n'), 'utf8');
    const dest = path.join(outputDir, 'human.mp4');
    await this.runFfmpeg(buildShotConcatCommand({
      segments,
      listPath,
      audioPath,
      outputPath: dest,
      width: template.project_settings.width,
      height: template.project_settings.height,
      fps: template.project_settings.fps,
    }), outputDir);
    this.logger.log('[oral-workshop] 任务 ' + job.id + ' digitalHuman 多镜头合成完成（' + shots.length + ' 镜头）');
    return { video_path: dest, source: 'multishot', engine: 'multi', shots: shots.length };
  }

  /**
   * videoEdit：服务器 ffmpeg 合成（人声+BGM 混音 → 数字人视频+ASS 字幕+品牌水印+AI 角标 → final.mp4）
   * 输入来自上游步骤产物：voiceClone.audio_path、digitalHuman.video_path。
   */
  private async runVideoEdit(job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    const results = await this.service.getStepResults(job.id);
    const voiceArtifact = results.voiceClone ?? {};
    const humanArtifact = results.digitalHuman ?? {};
    const audioPath = String(voiceArtifact.audio_path || job.audioUrl || '');
    const humanVideoPath = String(humanArtifact.video_path || humanArtifact.video_url || job.videoUrl || '');
    if (!audioPath || !humanVideoPath) {
      throw new Error('videoEdit 缺少合成输入（需 voiceClone.audio_path 与 digitalHuman.video_path）');
    }
    const template = loadTemplate(this.templateIdOf(job));
    const outputDir = this.outputDirFor(job);
    fs.mkdirSync(outputDir, { recursive: true });
    const badgeImagePath = process.env.ORAL_WORKSHOP_BADGE_IMAGE || ensureBadgeImage(outputDir);
    const script = job.rewrittenScript || job.scriptInput || '';
    const engineCfg = await this.readEngineConfig();
    let subtitles: ReturnType<typeof segmentScript> | undefined = segmentScript(script);
    // E7：字幕开关（任务级 subtitlesEnabled，默认开）
    const subtitlesEnabled = job.subtitlesEnabled !== false;
    if (!subtitlesEnabled) subtitles = undefined;
    // E4：字幕文本覆盖（用户编辑的多行字幕，每行一条；留空=按文案自动分段）
    if (subtitlesEnabled && job.subtitlesOverride?.trim()) {
      subtitles = segmentScript(job.subtitlesOverride.trim());
    }
    let bilingual = false;
    let subtitleLang = 'zh';
    const targetLang = job.targetLang ? String(job.targetLang).trim() : '';
    if (subtitlesEnabled && targetLang && targetLang !== 'zh') {
      // 指定目标语言：zh + 目标语言 双行字幕（zh-xx 方言同理，LLM 翻译）
      const pairs = await this.llm.translateSubtitles(script, targetLang);
      if (!pairs || pairs.length === 0) {
        throw new Error(`双语字幕（${targetLang}）：翻译结果为空，请检查 LLM 供应商配置`);
      }
      subtitles = segmentScriptBilingual(pairs.map((p) => ({ zh: p.zh, en: p.translated })));
      bilingual = true;
      subtitleLang = targetLang;
    } else if (subtitlesEnabled && job.bilingual) {
      const pairs = await this.llm.translateBilingual(script);
      if (!pairs || pairs.length === 0) {
        throw new Error('双语字幕：翻译结果为空，请检查 LLM 供应商配置');
      }
      subtitles = segmentScriptBilingual(pairs);
      bilingual = true;
      subtitleLang = 'en';
    }
    // E3：BGM（任务级 bgmUrl > 模板 auto_bgm 的 BGM 库默认 > 无 BGM）
    let bgmPath: string | undefined;
    const bgmUrl = job.bgmUrl || (template.auto_bgm ? engineCfg.bgmLibrary?.[0]?.url : undefined) || undefined;
    if (job.bgmEnabled !== false && bgmUrl) {
      const bgmDest = path.join(outputDir, 'bgm' + (extnameOf(bgmUrl) || '.mp3'));
      try {
        await downloadTo(bgmUrl, bgmDest);
        bgmPath = bgmDest;
      } catch (err) {
        this.logger.warn('[oral-workshop] 任务 ' + job.id + ' BGM 下载失败，跳过 BGM: ' + (err as Error).message);
      }
    }
    // P3 D4/E6：画中画素材（下载到本地，图片/视频均可；失败跳过并警告）
    const pipAssets: Array<{ path: string; isImage?: boolean; position?: 'tl' | 'tr' | 'bl' | 'br' | 'center'; scale?: number; startSec?: number; endSec?: number }> = [];
    const pipConfig = this.service.parsePipAssets(job.pipAssets);
    if (pipConfig && pipConfig.length > 0) {
      for (const [idx, pip] of pipConfig.entries()) {
        const ext = extnameOf(pip.url) || (/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(pip.url) ? '.png' : '.mp4');
        const dest = path.join(outputDir, 'pip' + idx + ext);
        try {
          await downloadTo(pip.url, dest);
          pipAssets.push({
            path: dest,
            isImage: /\.(png|jpe?g|gif|webp|bmp)$/i.test(ext),
            position: pip.position as 'tl' | 'tr' | 'bl' | 'br' | 'center',
            scale: pip.scale,
            startSec: pip.startSec,
            endSec: pip.endSec,
          });
        } catch (err) {
          this.logger.warn('[oral-workshop] 任务 ' + job.id + ' 画中画素材下载失败，跳过: ' + (err as Error).message);
        }
      }
    }
    const plan = composePlan({
      voicePath: audioPath,
      humanVideoPath,
      pipAssets: pipAssets.length > 0 ? pipAssets : undefined,
      subtitles,
      bilingual,
      bgmPath,
      bgmVolume: job.bgmVolume != null ? Math.min(Math.max(Number(job.bgmVolume), 0), 1) : 0.2,
      highlightKeywords: template.subtitle_config?.highlight_keywords ?? [],
      template,
      badgeImagePath,
      fontDir: process.env.ORAL_WORKSHOP_FONT_DIR || undefined,
      watermark: engineCfg.watermarkEnabled
        ? { text: engineCfg.watermarkText, fontPath: process.env.ORAL_WORKSHOP_FONT_PATH || undefined }
        : undefined,
      coverTitle: undefined,
      fontPath: process.env.ORAL_WORKSHOP_FONT_PATH || undefined,
      outputDir,
      outputName: 'final.mp4',
    });
    this.writeAssFile(plan);
    for (const cmd of plan.commands) {
      await this.runFfmpeg(cmd, outputDir);
    }
    return {
      video_url: plan.finalVideoPath,
      audio_url: audioPath,
      template_id: template.template_id,
      width: template.project_settings.width,
      height: template.project_settings.height,
      bilingual,
      subtitle_lang: subtitleLang,
      composedAt: new Date().toISOString(),
    };
  }

  /** titleCover：封面渲染（视频首帧 + h1/h2 标题，模板样式）+ 标题元数据 */
  private async runTitleCover(job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    const results = await this.service.getStepResults(job.id);
    const videoEditArtifact = results.videoEdit ?? {};
    const videoPath = String(videoEditArtifact.video_url || job.videoUrl || '');
    if (!videoPath) throw new Error('titleCover 缺少视频输入（需 videoEdit.video_url）');
    const script = job.rewrittenScript || job.scriptInput || '';
    const title = await this.resolveTitle(job, script);
    const template = loadTemplate(this.templateIdOf(job));
    const outputDir = this.outputDirFor(job);
    fs.mkdirSync(outputDir, { recursive: true });
    const coverPath = path.join(outputDir, 'cover.png');
    const cmd = buildCoverCommand({
      videoPath,
      outputPath: coverPath,
      title,
      template,
      fontPath: process.env.ORAL_WORKSHOP_FONT_PATH || undefined,
    });
    await this.runFfmpeg(cmd, outputDir);
    return {
      cover_url: coverPath,
      title_h1: title.h1,
      title_h2: title.h2,
      title: title.h1,
      generatedAt: new Date().toISOString(),
    };
  }

  /** 标题：优先 LLM（title_publish），失败/未注入时用文案兜底 */
  private async resolveTitle(job: OralWorkshopJobEntity, script: string): Promise<TitlePair> {
    if (this.llm) {
      try {
        const llmTitle = await this.llm.generateTitle(script);
        return deriveTitle(script, llmTitle);
      } catch (err) {
        this.logger.warn(`[oral-workshop] 任务 ${job.id} 标题生成失败，使用兜底标题: ${(err as Error).message}`);
      }
    }
    return deriveTitle(script);
  }

  /** 读取引擎配置：环境变量优先 → system_config.oral_workshop → 默认 auto */
  private async readEngineConfig(): Promise<OralWorkshopEngineConfig> {
    let db: Record<string, unknown> = {};
    if (this.configRepo) {
      try {
        const row = await this.configRepo.findOne({ where: { section: 'oral_workshop' } });
        db = row?.configValue ?? {};
      } catch (err) {
        this.logger.warn('[oral-workshop] 读取引擎配置失败，使用默认值: ' + (err as Error).message);
      }
    }
    const str = (envKey: string, dbKey: string, fallback: string): string => {
      const env = process.env[envKey];
      if (env !== undefined && env !== '') return env;
      const v = db[dbKey];
      return typeof v === 'string' && v ? v : fallback;
    };
    const num = (envKey: string, dbKey: string, fallback: number): number => {
      const env = process.env[envKey];
      if (env !== undefined && env !== '') {
        const n = Number(env);
        if (Number.isFinite(n) && n > 0) return Math.round(n);
      }
      const v = db[dbKey];
      return typeof v === 'number' && v > 0 ? Math.round(v) : fallback;
    };
    const bool = (envKey: string, dbKey: string, fallback: boolean): boolean => {
      const env = process.env[envKey];
      if (env !== undefined) return env !== 'false';
      const v = db[dbKey];
      return typeof v === 'boolean' ? v : fallback;
    };
    const tierOf = (dbKey: string, envPrefix: string): VoiceTierConfig => {
      const raw = (db[dbKey] ?? {}) as Record<string, unknown>;
      const tStr = (k: string, fb: string): string => {
        const v = raw[k];
        return typeof v === 'string' && v ? v : fb;
      };
      return {
        resourceId: tStr('resourceId', str(envPrefix + '_RESOURCE_ID', dbKey + '_resourceId', 'seed-icl-2.0')),
        model: tStr('model', str(envPrefix + '_MODEL', dbKey + '_model', '')),
        speakerId: tStr('speakerId', str(envPrefix + '_SPEAKER_ID', dbKey + '_speakerId', '')),
        refAudioUrl: tStr('refAudioUrl', str(envPrefix + '_REF_AUDIO', dbKey + '_refAudioUrl', '')),
        refAudioText: tStr('refAudioText', str(envPrefix + '_REF_AUDIO_TEXT', dbKey + '_refAudioText', '')),
        creditsCost: typeof raw.creditsCost === 'number' && raw.creditsCost >= 0 ? Math.round(raw.creditsCost) : 0,
      };
    };
    const poolRaw = Array.isArray(db.voicePool) ? db.voicePool : [];
    const voicePool = poolRaw
      .filter((v): v is { speakerId?: unknown; name?: unknown; resourceId?: unknown } => typeof v === 'object' && v !== null)
      .map((v) => ({
        speakerId: String(v.speakerId ?? '').trim(),
        name: typeof v.name === 'string' ? v.name : '',
        resourceId: typeof v.resourceId === 'string' && v.resourceId ? v.resourceId : 'seed-tts-2.0',
      }))
      .filter((v) => !!v.speakerId);
    const version = (envKey: string, dbKey: string): 'V1' | 'V2' | undefined => {
      const env = process.env[envKey];
      if (env === 'V1' || env === 'V2') return env;
      const v = db[dbKey];
      return v === 'V1' || v === 'V2' ? v : undefined;
    };
    return {
      voiceEngine: normalizeEngine(str('ORAL_WORKSHOP_VOICE_ENGINE', 'voiceEngine', 'auto'), ['volcano', 'local', 'auto'] as const, 'auto'),
      digitalHumanEngine: normalizeEngine(
        str('ORAL_WORKSHOP_DIGITAL_HUMAN_ENGINE', 'digitalHumanEngine', 'auto'),
        ['volcano', 'local', 'auto', 'heygen'] as const,
        'auto',
      ),
      watermarkEnabled: bool('ORAL_WORKSHOP_WATERMARK_ENABLED', 'watermarkEnabled', true),
      watermarkText: str('ORAL_WORKSHOP_WATERMARK_TEXT', 'watermarkText', '深瞳AI'),
      maxConcurrentJobs: num('ORAL_WORKSHOP_MAX_CONCURRENT_JOBS', 'maxConcurrentJobs', 5),
      bgmLibrary: Array.isArray(db.bgmLibrary)
        ? db.bgmLibrary
            .filter((v): v is { name?: unknown; url?: unknown; id?: unknown; category?: unknown } => typeof v === 'object' && v !== null)
            .map((v) => ({
              id: String(v.id ?? v.name ?? ''),
              name: String(v.name ?? ''),
              url: String(v.url ?? ''),
              category: typeof v.category === 'string' ? v.category : undefined,
            }))
            .filter((v) => Boolean(v.url))
        : [],
      volcano: {
        apiKey: str('VOLCANO_ARK_API_KEY', 'volcanoApiKey', ''),
        voiceEndpoint: str('VOLCANO_ARK_ENDPOINT', 'voiceEndpoint', 'https://ark.cn-beijing.volces.com/api/v3'),
        voiceModelV1: str('VOLCANO_VOICE_MODEL_V1', 'voiceModelV1', ''),
        voiceModelV2: str('VOLCANO_VOICE_MODEL_V2', 'voiceModelV2', ''),
        voiceModel: str('VOLCANO_VOICE_MODEL', 'voiceModel', ''),
        voiceApiKey: str('VOLCANO_VOICE_API_KEY', 'voiceApiKey', ''),
        voiceResourceId: str('VOLCANO_VOICE_RESOURCE_ID', 'voiceResourceId', 'seed-icl-2.0'),
        voiceCloneEndpoint: str('VOLCANO_VOICE_CLONE_ENDPOINT', 'voiceCloneEndpoint', 'https://openspeech.bytedance.com/api/v3/tts/voice_clone'),
        voiceFormat: str('VOLCANO_VOICE_FORMAT', 'voiceFormat', 'mp3'),
        voiceSampleRate: num('VOLCANO_VOICE_SAMPLE_RATE', 'voiceSampleRate', 24000),
        voiceSpeechRate: num('VOLCANO_VOICE_SPEECH_RATE', 'voiceSpeechRate', 0),
        voiceLoudnessRate: num('VOLCANO_VOICE_LOUDNESS_RATE', 'voiceLoudnessRate', 0),
        voiceEnableSubtitle: bool('VOLCANO_VOICE_ENABLE_SUBTITLE', 'voiceEnableSubtitle', false),
        voiceRefAudio: str('ORAL_WORKSHOP_VOICE_REF_AUDIO', 'voiceRefAudioUrl', ''),
        voiceSpeakerId: str('ORAL_WORKSHOP_VOICE_SPEAKER_ID', 'voiceSpeakerId', ''),
        dhEndpoint: str('VOLCANO_DIGITAL_HUMAN_ENDPOINT', 'dhEndpoint', ''),
        dhSubmitPath: str('VOLCANO_DH_SUBMIT_PATH', 'dhSubmitPath', '/digital-human/submit'),
        dhQueryPath: str('VOLCANO_DH_QUERY_PATH', 'dhQueryPath', '/digital-human/query'),
        dhModelVersion: version('VOLCANO_DH_MODEL_VERSION', 'dhModelVersion'),
        dhDefaultImageId: str('ORAL_WORKSHOP_DIGITAL_HUMAN_ID', 'dhDefaultImageId', ''),
        baseCredits: num('ORAL_WORKSHOP_BASE_CREDITS', 'baseCredits', 5),
        voiceTierV1: tierOf('voiceTierV1', 'ORAL_WORKSHOP_VOICE_TIER_V1'),
        voiceTierV2: tierOf('voiceTierV2', 'ORAL_WORKSHOP_VOICE_TIER_V2'),
        dhTierV1: { creditsCost: num('ORAL_WORKSHOP_DH_TIER_V1_CREDITS', 'dhTierV1.creditsCost', 0) },
        dhTierV2: { creditsCost: num('ORAL_WORKSHOP_DH_TIER_V2_CREDITS', 'dhTierV2.creditsCost', 0) },
        voicePool,
      },
      heygen: {
        apiKey: str('HEYGEN_API_KEY', 'heygenApiKey', ''),
        endpoint: str('HEYGEN_ENDPOINT', 'heygenEndpoint', 'https://api.heygen.com'),
        quality: str('HEYGEN_QUALITY', 'heygenQuality', '1080') === '720' ? '720' : '1080',
        defaultAvatarId: str('ORAL_WORKSHOP_HEYGEN_AVATAR_ID', 'heygenDefaultAvatarId', ''),
      },
    };
  }

  private hasVolcanoVoice(cfg: OralWorkshopEngineConfig): boolean {
    const v = cfg.volcano;
    const t1 = v.voiceTierV1;
    const t2 = v.voiceTierV2;
    return Boolean(
      (v.voiceApiKey || v.apiKey) &&
        (t1.speakerId || t1.refAudioUrl || t2.speakerId || t2.refAudioUrl || v.voiceModelV1 || v.voiceModelV2 || v.voiceModel || v.voiceSpeakerId),
    );
  }

  private hasVolcanoDigitalHuman(cfg: OralWorkshopEngineConfig): boolean {
    return Boolean(cfg.volcano.apiKey && cfg.volcano.dhEndpoint);
  }

  private hasHeygen(cfg: OralWorkshopEngineConfig): boolean {
    return Boolean(cfg.heygen.apiKey);
  }

  /** 将 composePlan 生成的 ASS 内容写入临时文件（供 subtitles 滤镜引用） */
  private writeAssFile(plan: FfmpegPlan): void {
    if (!plan.assContent) return;
    const assPath = plan.tempFiles.find((f) => f.endsWith('.ass'));
    if (!assPath) return;
    fs.writeFileSync(assPath, plan.assContent, 'utf8');
  }

  /** 任务模板 ID：number/字符串统一归一为 t1/t2 形式 */
  private templateIdOf(job: OralWorkshopJobEntity): string {
    const raw = job.templateId ?? 't1';
    const s = String(raw);
    return /^t\d+$/i.test(s) ? s.toLowerCase() : 't' + s;
  }

  /** 产物目录：默认系统临时目录下 oral-workshop/job-<id>，可用环境变量覆盖 */
  private outputDirFor(job: OralWorkshopJobEntity): string {
    return process.env.ORAL_WORKSHOP_OUTPUT_DIR || path.join(os.tmpdir(), 'oral-workshop', 'job-' + job.id);
  }
}

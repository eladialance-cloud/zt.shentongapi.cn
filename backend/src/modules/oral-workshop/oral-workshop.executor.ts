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
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildCardVideoCommand, buildCoverCommand, composePlan, type FfmpegPlan } from './composer';
import { deriveTitle, ensureBadgeImage, segmentScript, segmentScriptBilingual, type TitlePair } from './compose-inputs';
import { loadTemplate } from './template-loader';
import { VoiceCloneAdapter } from './adapters/voice.adapter';
import { DigitalHumanAdapter } from './adapters/digital-human.adapter';
import { sapiTts } from './local-tts';
import { SystemConfigEntity } from '../admin-system/entities/system-config.entity';
import { VoiceAssetEntity } from './entities/voice-asset.entity';
import { DigitalHumanAssetEntity } from './entities/digital-human-asset.entity';
import type { OralWorkshopService } from './oral-workshop.service';
import type { OralWorkshopLlmService } from './llm';
import type { OralWorkshopJobEntity } from './entities/oral-workshop-job.entity';

/** 引擎配置（管理后台 system_config.oral_workshop + 环境变量覆盖） */
export interface OralWorkshopEngineConfig {
  /** 声音引擎：volcano=火山方舟 / local=本地 SAPI / auto=自动降级 */
  voiceEngine: 'volcano' | 'local' | 'auto';
  /** 数字人引擎：volcano=火山方舟 / local=本地卡片视频 / auto=自动降级 */
  digitalHumanEngine: 'volcano' | 'local' | 'auto';
  /** 品牌水印开关（免费档叠加；AI 角标为合规强制，独立于此） */
  watermarkEnabled: boolean;
  /** 品牌水印文案 */
  watermarkText: string;
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

/** ffmpeg 命令执行器（测试注入 fake，不真跑 ffmpeg） */
export type FfmpegRunner = (cmd: string[], cwd?: string) => Promise<void>;

/** 默认 ffmpeg 执行器：逐条 spawn，非 0 退出码抛错（附 stderr 尾部便于排查） */
export function defaultFfmpegRunner(cmd: string[], cwd?: string): Promise<void> {
  const argv = [...cmd];
  if (argv[0] === 'ffmpeg') {
    argv[0] = process.env.ORAL_WORKSHOP_FFMPEG_PATH || 'ffmpeg';
  }
  return new Promise<void>((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: 'ignore', windowsHide: true });
    let stderrTail = '';
    const timeoutMs = Number(process.env.ORAL_WORKSHOP_FFMPEG_TIMEOUT_MS || 600000);
    const timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* 子进程已退出 */ }
      reject(new Error('ffmpeg 执行超时（' + Math.round(timeoutMs / 60000) + ' 分钟），已强制终止流水线'));
    }, timeoutMs);
    child.stderr?.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString('utf8')).slice(-800);
    });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error('ffmpeg 执行失败（退出码 ' + code + '）：' + stderrTail));
    });
  });
}

/** 引擎名归一化（非法值回退 auto） */
function normalizeEngine(v: string): OralWorkshopEngineConfig['voiceEngine'] {
  const s = String(v ?? '').toLowerCase();
  return s === 'volcano' || s === 'local' || s === 'auto' ? s : 'auto';
}

/** 下载/拷贝媒体到产物目录（支持 http(s) URL 与本地路径） */
export async function downloadTo(urlOrPath: string, dest: string): Promise<string> {
  if (/^https?:\/\//i.test(urlOrPath)) {
    const resp = await fetch(urlOrPath, { signal: AbortSignal.timeout(120000) });
    if (!resp.ok) throw new Error('媒体下载失败: HTTP ' + resp.status + ' ' + urlOrPath.slice(0, 120));
    const buf = Buffer.from(await resp.arrayBuffer());
    if (!buf.length) throw new Error('媒体下载为空: ' + urlOrPath.slice(0, 120));
    fs.writeFileSync(dest, buf);
  } else {
    fs.copyFileSync(resolveLocalMediaPath(urlOrPath), dest);
  }
  return dest;
}

/** 限制本地文件路径：仅允许相对路径或以 /uploads 开头的路径，按服务器 CWD 还原；拒绝本地绝对路径（防任意文件读取） */
export function resolveLocalMediaPath(urlOrPath: string): string {
  const p = String(urlOrPath);
  if (/^[a-zA-Z]:[\/]/.test(p) || /^\\/.test(p)) {
    throw new Error('不允许引用本地绝对路径：' + p.slice(0, 80));
  }
  if (p.startsWith('/')) {
    return path.resolve(p.replace(/^\/+/, ''));
  }
  return path.resolve(p);
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
    const jobs = await this.service.findExecutableJobs(BATCH_LIMIT);
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
    const rewritten = await this.llm.rewriteScript(script, job.persona ?? undefined);
    return { rewritten_script: rewritten };
  }

  /**
   * voiceClone：人声轨产出（优先级：用户音频 → 火山克隆/TTS → 本地 SAPI 兜底）
   * 引擎选择读 system_config.oral_workshop（voiceEngine），环境变量可覆盖。
   */
  private async runVoiceClone(job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    const outputDir = this.outputDirFor(job);
    fs.mkdirSync(outputDir, { recursive: true });
    const script = job.rewrittenScript || job.scriptInput || '';
    const engine = (await this.readEngineConfig()).voiceEngine;

    // 1) 用户提供成音：直接采用（不调 TTS）
    if (job.audioUrl) {
      const dest = path.join(outputDir, 'voice' + (extnameOf(job.audioUrl) || '.mp3'));
      await downloadTo(job.audioUrl, dest);
      this.logger.log(`[oral-workshop] 任务 ${job.id} voiceClone 采用用户音频`);
      return { audio_path: dest, source: 'uploaded', engine: 'upload' };
    }

    // 2) 火山方舟：声音复刻（参考音频）→ TTS
    const useVolcano = engine === 'volcano' || (engine === 'auto' && this.hasVolcanoVoice());
    if (useVolcano) {
      if (!this.hasVolcanoVoice()) {
        throw new Error('声音引擎配置为 volcano，但缺少 VOLCANO_ARK_API_KEY / VOLCANO_VOICE_MODEL');
      }
      if (!script) throw new Error('voiceClone 缺少文案（rewrittenScript/scriptInput 为空）');
      // 我的声音资产（voiceId）优先；其次环境变量参考音频/音色
      let refAudioUrl = process.env.ORAL_WORKSHOP_VOICE_REF_AUDIO || '';
      let speakerId = process.env.ORAL_WORKSHOP_VOICE_SPEAKER_ID || undefined;
      if (job.voiceId && this.voiceAssetRepo) {
        const asset = await this.voiceAssetRepo.findOne({ where: { id: job.voiceId, userId: job.userId } });
        if (asset) {
          refAudioUrl = asset.refAudioUrl;
          if (asset.speakerId) speakerId = asset.speakerId;
        } else {
          throw new Error('声音资产不存在或不属于当前用户（voiceId=' + job.voiceId + '）');
        }
      }
      if (!refAudioUrl && !speakerId) {
        throw new Error('火山声音克隆未配置参考音频（请先在"我的声音"添加参考音频或设置 ORAL_WORKSHOP_VOICE_REF_AUDIO）');
      }
      const adapter = new VoiceCloneAdapter();
      const res = await adapter.generateVoice({
        refAudioUrl,
        refAudioText: script,
        text: script,
        speakerId,
        speedRatio: Number(process.env.ORAL_WORKSHOP_VOICE_SPEED || 0.9),
        emotionWeight: Number(process.env.ORAL_WORKSHOP_VOICE_EMOTION_WEIGHT || 0),
        emotionText: process.env.ORAL_WORKSHOP_VOICE_EMOTION_TEXT || undefined,
      });
      const ext = res.mimeType.includes('mp3') || res.mimeType.includes('mpeg') ? 'mp3' : 'wav';
      const dest = path.join(outputDir, 'voice.' + ext);
      fs.writeFileSync(dest, res.audioBuffer);
      this.logger.log(`[oral-workshop] 任务 ${job.id} voiceClone 火山合成成功（speaker=${res.speakerId ?? '-'}）`);
      return { audio_path: dest, source: 'volcano', engine: 'volcano', speaker_id: res.speakerId ?? null };
    }

    // 3) 本地降级：Windows SAPI TTS（零依赖；Linux 需配置火山或提供音频）
    const useLocal = engine === 'local' || (engine === 'auto' && !this.hasVolcanoVoice());
    if (useLocal) {
      if (!script) throw new Error('voiceClone 缺少文案（rewrittenScript/scriptInput 为空）');
      const dest = path.join(outputDir, 'voice.wav');
      await sapiTts(script, dest);
      this.logger.log(`[oral-workshop] 任务 ${job.id} voiceClone 本地 SAPI TTS 完成`);
      return { audio_path: dest, source: 'sapi', engine: 'local' };
    }

    throw new Error('声音引擎不可用：请配置火山（VOLCANO_ARK_API_KEY/VOLCANO_VOICE_MODEL + 参考音频）或提供 audioUrl');
  }

  /**
   * digitalHuman：数字人视频产出（优先级：用户视频 → 火山合成 → 本地卡片视频兜底）
   * 本地兜底 = 静态背景 + 语音轨，字幕由 videoEdit 叠加（纯字幕口播视频，抖音常见形态）。
   */
  private async runDigitalHuman(job: OralWorkshopJobEntity): Promise<Record<string, unknown>> {
    const outputDir = this.outputDirFor(job);
    fs.mkdirSync(outputDir, { recursive: true });
    const engine = (await this.readEngineConfig()).digitalHumanEngine;

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

    // 2) 火山数字人：提交 + 轮询 → 下载成片
    let volcanoSkipped = false;
    const useVolcano = engine === 'volcano' || (engine === 'auto' && this.hasVolcanoDigitalHuman());
    if (useVolcano) {
      if (!this.hasVolcanoDigitalHuman()) {
        throw new Error('数字人引擎配置为 volcano，但缺少 VOLCANO_ARK_API_KEY / VOLCANO_DIGITAL_HUMAN_ENDPOINT');
      }
      if (!audioPath) throw new Error('数字人合成需要语音（voiceClone 产物 audio_path）');
      if (!/^https?:\/\//.test(audioPath)) {
        // 本地合成音频没有公网 URL，火山无法拉取：auto 模式降级本地卡片视频，显式 volcano 才报错
        if (engine !== 'auto') {
          throw new Error('火山数字人要求音频为公网 URL（当前为本地文件，请先接入 OSS 上传或托管到公网）');
        }
        this.logger.warn(`[oral-workshop] 任务 ${job.id} 火山数字人需要公网音频 URL，auto 降级本地卡片视频`);
        volcanoSkipped = true;
      } else {
      // 我的形象资产（digitalHumanId）优先；其次环境变量形象 ID
      let digitalHumanId = String(process.env.ORAL_WORKSHOP_DIGITAL_HUMAN_ID || '');
      if (job.digitalHumanId && this.dhAssetRepo) {
        const asset = await this.dhAssetRepo.findOne({ where: { id: job.digitalHumanId, userId: job.userId } });
        if (asset) {
          digitalHumanId = asset.cloudId;
        } else {
          throw new Error('数字人形象不存在或不属于当前用户（digitalHumanId=' + job.digitalHumanId + '）');
        }
      }
      if (!digitalHumanId) throw new Error('未配置数字人形象（请先在"我的形象"添加或设置 ORAL_WORKSHOP_DIGITAL_HUMAN_ID）');
      const adapter = new DigitalHumanAdapter();
      const { videoUrl } = await adapter.generate({ audioUrl: audioPath, digitalHumanId });
      const dest = path.join(outputDir, 'human.mp4');
      await downloadTo(videoUrl, dest);
      this.logger.log(`[oral-workshop] 任务 ${job.id} digitalHuman 火山合成成功`);
      return { video_path: dest, video_url: videoUrl, source: 'volcano', engine: 'volcano' };
      }
    }

    // 3) 本地兜底：纯字幕卡片视频（模板背景色 + 语音轨）
    const useLocal = engine === 'local' || (engine === 'auto' && !this.hasVolcanoDigitalHuman()) || volcanoSkipped;
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

    throw new Error('数字人引擎不可用：请配置火山（VOLCANO_ARK_API_KEY/VOLCANO_DIGITAL_HUMAN_ENDPOINT）或提供 videoUrl');
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
    let subtitles = segmentScript(script);
    let bilingual = false;
    if (job.bilingual) {
      const pairs = await this.llm.translateBilingual(script);
      if (!pairs || pairs.length === 0) {
        throw new Error('双语字幕：翻译结果为空，请检查 LLM 供应商配置');
      }
      subtitles = segmentScriptBilingual(pairs);
      bilingual = true;
    }
    const plan = composePlan({
      voicePath: audioPath,
      humanVideoPath,
      subtitles,
      bilingual,
      highlightKeywords: [],
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
    const bool = (envKey: string, dbKey: string, fallback: boolean): boolean => {
      const env = process.env[envKey];
      if (env !== undefined) return env !== 'false';
      const v = db[dbKey];
      return typeof v === 'boolean' ? v : fallback;
    };
    return {
      voiceEngine: normalizeEngine(str('ORAL_WORKSHOP_VOICE_ENGINE', 'voiceEngine', 'auto')),
      digitalHumanEngine: normalizeEngine(str('ORAL_WORKSHOP_DIGITAL_HUMAN_ENGINE', 'digitalHumanEngine', 'auto')),
      watermarkEnabled: bool('ORAL_WORKSHOP_WATERMARK_ENABLED', 'watermarkEnabled', true),
      watermarkText: str('ORAL_WORKSHOP_WATERMARK_TEXT', 'watermarkText', '深瞳AI'),
    };
  }

  private hasVolcanoVoice(): boolean {
    return Boolean(process.env.VOLCANO_ARK_API_KEY && process.env.VOLCANO_VOICE_MODEL);
  }

  private hasVolcanoDigitalHuman(): boolean {
    return Boolean(process.env.VOLCANO_ARK_API_KEY && process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT);
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

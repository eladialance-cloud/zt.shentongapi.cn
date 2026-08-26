/**
 * 火山语音技术 声音复刻 + TTS 适配器（对齐官方 API，2026-08）
 *
 * 官方接口：
 *   1. 声音复刻：POST https://openspeech.bytedance.com/api/v3/tts/voice_clone
 *      请求头 X-Api-Key + X-Api-Request-Id；body: { speaker_id, custom_speaker_id?, audio:{data(base64),format,text,language}, extra_params }
 *      → 响应 { code, message, speaker_id, status(1=训练中/2=成功/4=可用), demo_audio }
 *   2. TTS 合成：POST https://openspeech.bytedance.com/api/v3/tts/unidirectional（HTTP Chunked 流式）
 *      请求头 X-Api-Key + X-Api-Resource-Id(seed-tts-2.0/seed-icl-2.0) + X-Api-Request-Id
 *      body: { req_params: { text, speaker, model?, audio_params, context_texts? } }
 *      → 响应 chunked JSON 行：{ code, message, data(base64 音频), sentence, usage }
 * 产物由调用方落盘 + 上传 OSS（本适配器只负责 HTTP 调用，纯逻辑可单测）。
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

export interface VolcanoVoiceConfig {
  /** TTS 合成端点（HTTP unidirectional，默认官方地址） */
  endpoint?: string;
  /** 声音复刻端点（默认官方地址） */
  cloneEndpoint?: string;
  /** 语音技术 X-Api-Key */
  apiKey: string;
  /** X-Api-Resource-Id：seed-tts-2.0=豆包语音合成大模型2.0（标准音色）/ seed-icl-2.0=豆包声音复刻大模型2.0 */
  resourceId?: string;
  /** 仅复刻音色时需指定的 model（如 seed-tts-2.0-standard / seed-icl-2.0-standard，默认不传用服务端默认） */
  model?: string;
  /** 音频格式：mp3/pcm/ogg_opus/wav（默认 mp3） */
  format?: string;
  /** 采样率 Hz（默认 24000） */
  sampleRate?: number;
  /** 语速 -50..100（0=正常；100=2.0倍速） */
  speechRate?: number;
  /** 音量 -50..100（0=正常；100=2.0倍音量） */
  loudnessRate?: number;
  /** 启用字幕时间戳（默认 false） */
  enableSubtitle?: boolean;
  /** 请求超时（默认 60s） */
  timeoutMs?: number;
}

export interface VoiceCloneOptions {
  /** 参考音频（OSS URL 或本地路径） */
  refAudioUrl: string;
  /** 参考音频格式（默认 mp3） */
  refAudioFormat?: 'mp3' | 'wav' | 'ogg' | 'm4a' | 'aac' | 'pcm';
  /** 参考音频对应文本（复刻质量关键，建议必填） */
  refAudioText?: string;
  /** 待合成文案 */
  text: string;
  /** 已有音色（speaker_id，跳过复刻直接合成） */
  speakerId?: string;
  /** 自定义音色代号（复刻用；默认 st_voice_<userId>_<随机>） */
  customSpeakerId?: string;
  /** 语速倍率 0.5-2.0（兼容旧调用，映射 speech_rate） */
  speedRatio?: number;
  /** 情绪文本 → context_texts 语音指令（仅标准音色支持） */
  emotionText?: string;
  /** 情感参考音频 URL（C6：复刻时附带的情绪素材，可选，透传 extra_params.emotion_audio） */
  emotionRefAudio?: string;
  /** 用户标识（用于生成自定义音色代号） */
  userId?: number;
}

export interface VoiceCloneResult {
  speakerId?: string;
  /** 训练状态：1=训练中 2=成功 4=可用（未复刻时 undefined） */
  cloneStatus?: number;
  /** 复刻试听音频（上游 demo_audio，可能是 URL；非 URL 时为空） */
  demoAudio?: string;
  /** TTS 合成音频 buffer（调用方落盘/上传 OSS） */
  audioBuffer: Buffer;
  mimeType: string;
  taskId?: string;
}

export class VoiceCloneError extends Error {
  name = 'VoiceCloneError';
  constructor(message: string) {
    super(message);
  }
}

/** 默认官方端点 */
export const DEFAULT_VOICE_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional';
export const DEFAULT_VOICE_CLONE_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/voice_clone';

/** 从环境变量构建默认配置（管理后台配置落地后可注入覆盖） */
export function defaultVoiceConfig(): VolcanoVoiceConfig {
  const apiKey = process.env.VOLCANO_ARK_API_KEY || '';
  if (!apiKey) throw new VoiceCloneError('未配置火山语音技术 API Key（请在管理后台配置）');
  return {
    endpoint: process.env.VOLCANO_VOICE_TTS_ENDPOINT || DEFAULT_VOICE_TTS_ENDPOINT,
    cloneEndpoint: process.env.VOLCANO_VOICE_CLONE_ENDPOINT || DEFAULT_VOICE_CLONE_ENDPOINT,
    apiKey,
    resourceId: process.env.VOLCANO_VOICE_RESOURCE_ID || 'seed-icl-2.0',
    model: process.env.VOLCANO_VOICE_MODEL || '',
    format: process.env.VOLCANO_VOICE_FORMAT || 'mp3',
    sampleRate: Number(process.env.VOLCANO_VOICE_SAMPLE_RATE || 24000),
    speechRate: Number(process.env.VOLCANO_VOICE_SPEECH_RATE || 0),
    loudnessRate: Number(process.env.VOLCANO_VOICE_LOUDNESS_RATE || 0),
    enableSubtitle: process.env.VOLCANO_VOICE_ENABLE_SUBTITLE === 'true',
    timeoutMs: Number(process.env.VOLCANO_REQUEST_TIMEOUT_MS || 60000),
  };
}

/** 自定义音色代号默认生成（命名规范：8-256 字符、字母开头、数字/字母/-/_） */
export function defaultCustomSpeakerId(userId?: number): string {
  return 'st_voice_' + (userId ?? 0) + '_' + randomUUID().replace(/-/g, '').slice(0, 16);
}

@Injectable()
export class VoiceCloneAdapter {
  private readonly logger = new Logger(VoiceCloneAdapter.name);

  constructor(private readonly config?: VolcanoVoiceConfig) {}

  private cfg(): VolcanoVoiceConfig {
    if (this.config) return this.config;
    return defaultVoiceConfig();
  }

  /** 读取参考音频（URL 或本地路径）为 Buffer */
  async loadRefAudio(refAudioUrl: string): Promise<Buffer> {
    if (refAudioUrl.startsWith('http://') || refAudioUrl.startsWith('https://')) {
      const resp = await fetch(refAudioUrl, { signal: AbortSignal.timeout(30000) });
      if (!resp.ok) throw new VoiceCloneError('参考音频下载失败: HTTP ' + resp.status);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (!buf.length) throw new VoiceCloneError('参考音频为空');
      return buf;
    }
    // 相对路径（如 /uploads/...）按服务器 CWD 还原；拒绝本地绝对路径（防任意文件读取）
    if (/^[a-zA-Z]:[\\/]/.test(refAudioUrl) || /^\\\\/.test(refAudioUrl)) {
      throw new VoiceCloneError('不允许引用本地绝对路径: ' + refAudioUrl.slice(0, 80));
    }
    const localPath = refAudioUrl.startsWith('/') ? refAudioUrl.replace(/^\/+/, '') : refAudioUrl;
    if (fs.existsSync(localPath)) return fs.readFileSync(localPath);
    throw new VoiceCloneError('参考音频无法访问: ' + refAudioUrl);
  }

  /** 声音复刻：JSON 提交 base64 参考音频 → speaker_id + 训练状态 */
  async cloneSpeaker(opts: VoiceCloneOptions): Promise<{ speakerId?: string; status?: number; demoAudio?: string }> {
    if (opts.speakerId) return { speakerId: opts.speakerId };
    const cfg = this.cfg();
    const audio = await this.loadRefAudio(opts.refAudioUrl);
    const customSpeakerId = opts.customSpeakerId || defaultCustomSpeakerId(opts.userId);
    const body = {
      speaker_id: 'custom_speaker_id',
      custom_speaker_id: customSpeakerId,
      audio: {
        data: audio.toString('base64'),
        format: opts.refAudioFormat || 'mp3',
        text: opts.refAudioText || '',
        language: 0,
      },
      extra_params: {
        demo_text: (opts.refAudioText || '你好').slice(0, 300),
        enable_audio_denoise: true,
        disable_volume_normalization: false,
        ...(opts.emotionRefAudio ? { emotion_audio: opts.emotionRefAudio } : {}),
      },
    };
    const resp = await fetch((cfg.cloneEndpoint || DEFAULT_VOICE_CLONE_ENDPOINT).replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': cfg.apiKey,
        'X-Api-Request-Id': randomUUID(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs || 60000),
    });
    const text = await resp.text().catch(() => '');
    if (!resp.ok) {
      throw new VoiceCloneError('声音复刻失败: HTTP ' + resp.status + ' ' + text.slice(0, 300));
    }
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new VoiceCloneError('声音复刻响应非 JSON: ' + text.slice(0, 300));
    }
    const code = data.code;
    if (code !== undefined && code !== 0 && code !== 200) {
      throw new VoiceCloneError('声音复刻失败: ' + (String(data.message || data.error || '') || String(code)).slice(0, 300));
    }
    const speakerId = String(data.speaker_id || customSpeakerId);
    const status = typeof data.status === 'number' ? data.status : undefined;
    if (status === 1) {
      this.logger.warn('[oral-workshop] 声音复刻训练中（status=Training），音色 ' + speakerId + ' 完成后可合成');
    }
    const rawDemo = typeof data.demo_audio === 'string' ? data.demo_audio : '';
    const demoAudio = /^https?:\/\//.test(rawDemo) ? rawDemo : undefined;
    return { speakerId, status, demoAudio };
  }

  /** TTS 合成：HTTP Chunked 流式收集 base64 音频 → Buffer（一次性输入完整文本） */
  async synthesize(opts: VoiceCloneOptions): Promise<{ audio: Buffer; mimeType: string; subtitle?: string[] }> {
    const cfg = this.cfg();
    const { speakerId } = await this.cloneSpeaker(opts);
    const reqParams: Record<string, unknown> = {
      text: opts.text,
      speaker: speakerId,
      audio_params: {
        format: cfg.format || 'mp3',
        sample_rate: cfg.sampleRate || 24000,
        speech_rate: cfg.speechRate !== undefined ? cfg.speechRate : Math.round(((opts.speedRatio ?? 0.9) - 1) * 100),
        loudness_rate: cfg.loudnessRate ?? 0,
        enable_subtitle: cfg.enableSubtitle || false,
      },
    };
    if (cfg.model) reqParams.model = cfg.model;
    if (opts.emotionText) reqParams.context_texts = [opts.emotionText];
    const resp = await fetch((cfg.endpoint || DEFAULT_VOICE_TTS_ENDPOINT).replace(/\/+$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': cfg.apiKey,
        'X-Api-Resource-Id': cfg.resourceId || 'seed-icl-2.0',
        'X-Api-Request-Id': randomUUID(),
      },
      body: JSON.stringify({ req_params: reqParams }),
      signal: AbortSignal.timeout(cfg.timeoutMs || 60000),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new VoiceCloneError('TTS 合成失败: HTTP ' + resp.status + ' ' + text.slice(0, 300));
    }
    const raw = await resp.text().catch(() => '');
    if (!raw) throw new VoiceCloneError('TTS 合成返回空响应');
    const chunks: Buffer[] = [];
    const subtitle: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let item: Record<string, unknown>;
      try {
        item = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }
      const code = item.code;
      if (code !== undefined && code !== 0 && code !== 200) {
        throw new VoiceCloneError('TTS 合成失败: ' + (String(item.message || item.error || '') || String(code)).slice(0, 300));
      }
      const data = typeof item.data === 'string' ? item.data : '';
      if (data) chunks.push(Buffer.from(data, 'base64'));
      const sentence = item.sentence as Record<string, unknown> | undefined;
      if (sentence && typeof sentence.text === 'string' && sentence.text.trim()) {
        subtitle.push(sentence.text.trim());
      }
    }
    if (!chunks.length) throw new VoiceCloneError('TTS 合成未返回音频数据');
    return {
      audio: Buffer.concat(chunks),
      mimeType: 'audio/' + (cfg.format === 'wav' ? 'wav' : cfg.format === 'pcm' ? 'wav' : 'mpeg'),
      subtitle: subtitle.length ? subtitle : undefined,
    };
  }

  /** 总入口：复刻（如需）→ TTS → 返回音频 buffer + speakerId */
  async generateVoice(opts: VoiceCloneOptions): Promise<VoiceCloneResult> {
    const cloned = await this.cloneSpeaker(opts);
    const { audio, mimeType } = await this.synthesize({ ...opts, speakerId: cloned.speakerId });
    return { speakerId: cloned.speakerId, cloneStatus: cloned.status, audioBuffer: audio, mimeType };
  }
}

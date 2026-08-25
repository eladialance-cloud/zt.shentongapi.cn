/**
 * 火山方舟声音克隆 + TTS 适配器（M3）
 *
 * 参考轻语 voiceClone 参数映射（speaker_audio_url / emotion_weight / emotion_text / mode=slow）：
 *   1. 声音复刻：POST /audio/voice/clone（multipart：参考音频 + audio_format/audio_text）→ speaker_id
 *   2. 语音合成：POST /tts（text + speaker_id + speed_ratio=0.9[slow]）→ mp3
 * 端点/模型均通过环境变量或注入配置覆盖（管理后台联调时确认最终路径）。
 * 产物由调用方落盘 + 上传 OSS（本适配器只负责 HTTP 调用，纯逻辑可单测）。
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';

export interface VolcanoVoiceConfig {
  /** 火山方舟端点，默认 https://ark.cn-beijing.volces.com/api/v3 */
  endpoint?: string;
  apiKey: string;
  /** TTS 模型 ID（管理后台配置） */
  model: string;
  /** 模型版本：V1=标准版 / V2=高清增强版（云端服务端算法版本，可留空） */
  modelVersion?: 'V1' | 'V2';
  /** 声音复刻路径（默认 /audio/voice/clone） */
  clonePath?: string;
  /** TTS 路径（默认 /tts） */
  ttsPath?: string;
  /** 请求超时（默认 60s） */
  timeoutMs?: number;
}

export interface VoiceCloneOptions {
  /** 参考音频（OSS URL 或本地路径） */
  refAudioUrl: string;
  /** 参考音频格式（默认 mp3） */
  refAudioFormat?: 'mp3' | 'wav';
  /** 参考音频对应文本（提升克隆质量，建议必填） */
  refAudioText?: string;
  /** 待合成文案 */
  text: string;
  /** 已有克隆音色（跳过复刻，直接 TTS） */
  speakerId?: string;
  /** 语速倍率：slow≈0.9 / normal≈1.0 / fast≈1.1（默认 0.9） */
  speedRatio?: number;
  /** 情绪强度 0-1（可选） */
  emotionWeight?: number;
  /** 情绪文本（可选） */
  emotionText?: string;
  /** 用户标识（写 request 元数据） */
  userId?: number;
}

export interface VoiceCloneResult {
  speakerId?: string;
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

/** 从环境变量构建默认火山配置（管理后台配置落地后可注入覆盖） */
export function defaultVoiceConfig(): VolcanoVoiceConfig {
  const apiKey = process.env.VOLCANO_ARK_API_KEY || '';
  if (!apiKey) throw new VoiceCloneError('未配置 VOLCANO_ARK_API_KEY（请在管理后台配置火山方舟密钥）');
  return {
    endpoint: process.env.VOLCANO_ARK_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3',
    apiKey,
    model: process.env.VOLCANO_VOICE_MODEL || '',
    modelVersion: (process.env.VOLCANO_VOICE_MODEL_VERSION as 'V1' | 'V2') || undefined,
    clonePath: process.env.VOLCANO_VOICE_CLONE_PATH || '/audio/voice/clone',
    ttsPath: process.env.VOLCANO_VOICE_TTS_PATH || '/tts',
    timeoutMs: Number(process.env.VOLCANO_REQUEST_TIMEOUT_MS || 60000),
  };
}

@Injectable()
export class VoiceCloneAdapter {
  private readonly logger = new Logger(VoiceCloneAdapter.name);

  constructor(private readonly config?: VolcanoVoiceConfig) {}

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

  /** 声音复刻：multipart 提交参考音频 → speaker_id */
  async cloneSpeaker(opts: VoiceCloneOptions): Promise<string> {
    if (opts.speakerId) return opts.speakerId;
    const cfg = this.config || defaultVoiceConfig();
    const audio = await this.loadRefAudio(opts.refAudioUrl);
    const boundary = '----ow-' + Math.random().toString(36).slice(2, 12);
    const fields: Record<string, string> = {
      audio_format: opts.refAudioFormat || 'mp3',
      ...(opts.refAudioText ? { audio_text: opts.refAudioText } : {}),
      ...(opts.userId ? { user_id: String(opts.userId) } : {}),
    };
    const body = this.buildMultipart(audio, 'audio', fields, boundary);
    const resp = await fetch(this.url(cfg.endpoint!, cfg.clonePath!), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + cfg.apiKey,
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
      },
      // undici 运行时接受 Buffer，TS 类型层面需收窄为 BodyInit
      body: body as unknown as BodyInit,
      signal: AbortSignal.timeout(cfg.timeoutMs || 60000),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new VoiceCloneError('声音复刻失败: HTTP ' + resp.status + ' ' + txt.slice(0, 300));
    }
    const data = (await resp.json()) as { data?: { speaker_id?: string }; code?: number; message?: string };
    const speakerId = data?.data?.speaker_id;
    if (!speakerId) throw new VoiceCloneError('声音复刻未返回 speaker_id: ' + JSON.stringify(data).slice(0, 300));
    return speakerId;
  }

  /** TTS 合成：文案 → mp3 buffer（同步返回；异步任务由数字人阶段承载） */
  async synthesize(opts: VoiceCloneOptions): Promise<{ audio: Buffer; mimeType: string }> {
    const cfg = this.config || defaultVoiceConfig();
    if (!cfg.model) throw new VoiceCloneError('未配置火山 TTS 模型（VOLCANO_VOICE_MODEL）');
    const speakerId = await this.cloneSpeaker(opts);
    const body: Record<string, unknown> = {
      model: cfg.model,
      text: opts.text,
      speaker_id: speakerId,
      speed_ratio: opts.speedRatio ?? 0.9,
      response_format: 'mp3',
    };
    if (cfg.modelVersion) body.model_version = cfg.modelVersion;
    if (opts.emotionWeight !== undefined) body.emotion_weight = opts.emotionWeight;
    if (opts.emotionText) body.emotion_text = opts.emotionText;
    const resp = await fetch(this.url(cfg.endpoint!, cfg.ttsPath!), {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + cfg.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs || 60000),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      throw new VoiceCloneError('TTS 合成失败: HTTP ' + resp.status + ' ' + txt.slice(0, 300));
    }
    const ctype = resp.headers.get('content-type') || '';
    if (ctype.includes('json')) {
      const j = (await resp.json()) as { data?: { audio_base64?: string }; code?: number; message?: string };
      if (!j?.data?.audio_base64) throw new VoiceCloneError('TTS 未返回音频: ' + JSON.stringify(j).slice(0, 300));
      return { audio: Buffer.from(j.data.audio_base64, 'base64'), mimeType: 'audio/mpeg' };
    }
    return { audio: Buffer.from(await resp.arrayBuffer()), mimeType: ctype.split(';')[0] || 'audio/mpeg' };
  }

  /** 总入口：克隆（如需）→ TTS → 返回音频 buffer + speakerId */
  async generateVoice(opts: VoiceCloneOptions): Promise<VoiceCloneResult> {
    const speakerId = await this.cloneSpeaker(opts);
    const { audio, mimeType } = await this.synthesize({ ...opts, speakerId });
    return { speakerId, audioBuffer: audio, mimeType };
  }

  private url(endpoint: string, p: string): string {
    return endpoint.replace(/\/+$/, '') + (p.startsWith('/') ? p : '/' + p);
  }

  /** 手工构造 multipart body（便于单测断言） */
  buildMultipart(file: Buffer, fileField: string, fields: Record<string, string>, boundary: string): Buffer {
    const chunks: Buffer[] = [];
    const CRLF = '\r\n';
    const push = (s: string) => chunks.push(Buffer.from(s, 'utf8'));
    for (const [k, v] of Object.entries(fields)) {
      push('--' + boundary + CRLF);
      push('Content-Disposition: form-data; name="' + k + '"' + CRLF + CRLF);
      push(v + CRLF);
    }
    push('--' + boundary + CRLF);
    push('Content-Disposition: form-data; name="' + fileField + '"; filename="ref.' + (fields.audio_format || 'mp3') + '"' + CRLF);
    push('Content-Type: application/octet-stream' + CRLF + CRLF);
    chunks.push(file);
    push(CRLF);
    push('--' + boundary + '--' + CRLF);
    return Buffer.concat(chunks);
  }
}
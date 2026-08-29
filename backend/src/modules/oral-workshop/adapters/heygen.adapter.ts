/**
 * HeyGen 数字人适配器（M4+：替换火山数字人引擎）
 *
 * 流程：提交 图片/预置形象 + 音频 → 异步任务 → 轮询 → 产物 mp4 URL。
 * 两种形象模式：
 *   - talking photo（单图+音频）：avatar_id=INVALID_AVATAR_ID + avatar_image_url=图片公网URL
 *   - 预置形象：avatar_id=HeyGen 官方形象 ID
 * 认证：X-Api-Key（管理后台配置，需开通 HeyGen API 套餐）。
 * 注意：接口字段以 HeyGen 官方文档为准，接入后用真实 API Key 联调验证。
 */
import { Injectable, Logger } from '@nestjs/common';

export interface HeyGenConfig {
  /** API 端点（默认 https://api.heygen.com） */
  endpoint: string;
  /** HeyGen API Key（X-Api-Key） */
  apiKey: string;
  /** 生成质量：720 / 1080（默认 1080） */
  quality?: '720' | '1080';
  /** 轮询间隔 ms（默认 5000） */
  pollIntervalMs?: number;
  /** 最大轮询次数（默认 120 ≈ 10 分钟） */
  maxAttempts?: number;
  timeoutMs?: number;
  /** 成功状态值（默认 ['completed', 'success']） */
  successStatuses?: string[];
  /** 失败状态值（默认 ['failed', 'error', 'cancelled']） */
  failedStatuses?: string[];
}

export interface HeyGenJobOptions {
  /** TTS 产物音频（公网 URL，HeyGen 需可拉取） */
  audioUrl: string;
  /** talking photo 图片 URL（与 avatarId 二选一） */
  imageUrl?: string;
  /** HeyGen 预置形象 ID（与 imageUrl 二选一） */
  avatarId?: string;
  /** 画布宽（默认 1080） */
  width?: number;
  /** 画布高（默认 1920，竖屏口播） */
  height?: number;
}

export interface HeyGenAvatarItem {
  avatar_id: string;
  avatar_name?: string;
  /** 形象缩略图（桌面端选择展示） */
  avatar_url?: string;
  preview_avatar_url?: string;
}

export interface HeyGenResult {
  /** 产物视频 URL */
  videoUrl: string;
  videoId: string;
}

export class HeyGenError extends Error {
  name = 'HeyGenError';
  constructor(message: string) {
    super(message);
  }
}

/** HeyGen 业务成功码 */
const HEYGEN_OK = 10000;

@Injectable()
export class HeyGenAdapter {
  private readonly logger = new Logger(HeyGenAdapter.name);

  constructor(private readonly config?: HeyGenConfig) {}

  private cfg(): Required<Pick<HeyGenConfig, 'endpoint' | 'apiKey'>> & HeyGenConfig {
    if (this.config && this.config.apiKey) {
      return {
        ...this.config,
        successStatuses: this.config.successStatuses ?? ['completed', 'success'],
        failedStatuses: this.config.failedStatuses ?? ['failed', 'error', 'cancelled'],
      } as never;
    }
    const apiKey = process.env.HEYGEN_API_KEY || '';
    if (!apiKey) {
      throw new HeyGenError('未配置 HeyGen API Key（管理后台-口播工坊-HeyGen 配置，或环境变量 HEYGEN_API_KEY）');
    }
    return {
      endpoint: process.env.HEYGEN_ENDPOINT || 'https://api.heygen.com',
      apiKey,
      quality: (process.env.HEYGEN_QUALITY as '720' | '1080') || '1080',
      pollIntervalMs: Number(process.env.HEYGEN_POLL_INTERVAL_MS || 5000),
      maxAttempts: Number(process.env.HEYGEN_MAX_ATTEMPTS || 120),
      timeoutMs: Number(process.env.HEYGEN_REQUEST_TIMEOUT_MS || 60000),
      successStatuses: ['completed', 'success'],
      failedStatuses: ['failed', 'error', 'cancelled'],
    };
  }

  private url(path: string): string {
    const endpoint = this.cfg().endpoint.replace(/\/+$/, '');
    return endpoint + (path.startsWith('/') ? path : '/' + path);
  }

  /** 校验业务码：code 非 10000 抛 HeyGenError */
  private assertOk(data: { code?: number; message?: string }, ctx: string): void {
    if (data && typeof data.code === 'number' && data.code !== HEYGEN_OK) {
      throw new HeyGenError(ctx + '：HeyGen 错误码 ' + data.code + (data.message ? ' ' + String(data.message).slice(0, 200) : ''));
    }
  }

  /** 提交数字人合成任务 → video_id */
  async submitJob(opts: HeyGenJobOptions): Promise<string> {
    const cfg = this.cfg();
    if (!opts.audioUrl) throw new HeyGenError('HeyGen 数字人合成需要音频 URL');
    if (!opts.imageUrl && !opts.avatarId) {
      throw new HeyGenError('HeyGen 数字人合成需要形象图片（talking photo）或预置形象 ID');
    }
    const character: Record<string, unknown> = opts.avatarId
      ? { type: 'avatar', avatar_id: opts.avatarId }
      : { type: 'avatar', avatar_id: 'INVALID_AVATAR_ID', avatar_image_url: opts.imageUrl };
    const body: Record<string, unknown> = {
      video_inputs: [
        {
          character,
          voice: { type: 'audio', audio_url: opts.audioUrl },
        },
      ],
      dimension: {
        width: opts.width ?? 1080,
        height: opts.height ?? 1920,
      },
    };
    if (cfg.quality === '720') {
      (body.dimension as Record<string, number>).width = 720;
      (body.dimension as Record<string, number>).height = Math.round(((opts.height ?? 1920) * 720) / (opts.width ?? 1080));
    }
    const resp = await fetch(this.url('/v2/video/generate'), {
      method: 'POST',
      headers: {
        'X-Api-Key': cfg.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs || 60000),
    });
    const text = await resp.text().catch(() => '');
    if (!resp.ok) {
      throw new HeyGenError('HeyGen 任务提交失败: HTTP ' + resp.status + ' ' + text.slice(0, 300));
    }
    let data: { code?: number; message?: string; data?: { video_id?: string } };
    try {
      data = JSON.parse(text);
    } catch {
      throw new HeyGenError('HeyGen 任务提交返回非 JSON: ' + text.slice(0, 200));
    }
    this.assertOk(data, 'HeyGen 任务提交');
    const videoId = data?.data?.video_id;
    if (!videoId) throw new HeyGenError('HeyGen 任务提交未返回 video_id: ' + text.slice(0, 300));
    return videoId;
  }

  /** 查询任务状态（可注入 sleep 便于测试） */
  async queryJob(
    videoId: string,
    sleepFn: (ms: number) => Promise<void> = sleep,
  ): Promise<{ status: string; videoUrl?: string; error?: string }> {
    const cfg = this.cfg();
    const maxAttempts = cfg.maxAttempts || 120;
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts += 1;
      const resp = await fetch(
        this.url('/v1/video_status.get?video_id=' + encodeURIComponent(videoId)),
        {
          method: 'GET',
          headers: { 'X-Api-Key': cfg.apiKey },
          signal: AbortSignal.timeout(cfg.timeoutMs || 60000),
        },
      );
      const text = await resp.text().catch(() => '');
      if (!resp.ok) {
        throw new HeyGenError('HeyGen 任务查询失败: HTTP ' + resp.status + ' ' + text.slice(0, 300));
      }
      let data: {
        code?: number;
        message?: string;
        data?: { status?: string; video_url?: string; videoUrl?: string; error?: string };
      };
      try {
        data = JSON.parse(text);
      } catch {
        throw new HeyGenError('HeyGen 任务查询返回非 JSON: ' + text.slice(0, 200));
      }
      this.assertOk(data, 'HeyGen 任务查询');
      const status = String(data?.data?.status || '').toLowerCase();
      const videoUrl = data?.data?.video_url || data?.data?.videoUrl;
      if (cfg.failedStatuses?.includes(status)) {
        const err = data?.data?.error || '未知错误';
        throw new HeyGenError('HeyGen 数字人合成失败（' + status + '）: ' + err.slice(0, 300));
      }
      if (cfg.successStatuses?.includes(status)) {
        if (!videoUrl) throw new HeyGenError('HeyGen 任务成功但缺少 video_url');
        return { status, videoUrl };
      }
      this.logger.debug('[oral-workshop] HeyGen 任务轮询: ' + videoId + ' status=' + status);
      await sleepFn(cfg.pollIntervalMs || 5000);
    }
    throw new HeyGenError('HeyGen 数字人任务超时（' + maxAttempts + ' 次轮询，约 ' + Math.round(((cfg.pollIntervalMs || 5000) * maxAttempts) / 60000) + ' 分钟）');
  }

  /** 总入口：提交 + 轮询 → 产物视频 URL */
  async generate(opts: HeyGenJobOptions): Promise<HeyGenResult> {
    const videoId = await this.submitJob(opts);
    const { videoUrl } = await this.queryJob(videoId);
    if (!videoUrl) throw new HeyGenError('HeyGen 任务成功但缺少 video_url');
    return { videoId, videoUrl };
  }

  /** 拉取 HeyGen 官方预置形象库（管理后台测试连接 / 桌面端形象选择） */
  async listAvatars(): Promise<HeyGenAvatarItem[]> {
    const cfg = this.cfg();
    const resp = await fetch(this.url('/v1/avatars'), {
      method: 'GET',
      headers: { 'X-Api-Key': cfg.apiKey },
      signal: AbortSignal.timeout(cfg.timeoutMs || 30000),
    });
    const text = await resp.text().catch(() => '');
    if (!resp.ok) {
      throw new HeyGenError('HeyGen 形象列表拉取失败: HTTP ' + resp.status + ' ' + text.slice(0, 300));
    }
    let data: { code?: number; message?: string; data?: { avatars?: HeyGenAvatarItem[] } };
    try {
      data = JSON.parse(text);
    } catch {
      throw new HeyGenError('HeyGen 形象列表返回非 JSON: ' + text.slice(0, 200));
    }
    this.assertOk(data, 'HeyGen 形象列表');
    return Array.isArray(data?.data?.avatars) ? data.data.avatars : [];
  }
}

/** 默认等待（可替换以便测试） */
async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

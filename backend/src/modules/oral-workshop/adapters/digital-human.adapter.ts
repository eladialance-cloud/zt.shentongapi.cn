/**
 * 火山方舟数字人适配器（M4）
 *
 * 流程：提交音频 + 形象 → 异步任务 → 轮询 → 产物 human.mp4（OSS URL）。
 * 参数：modelVersion（V1/V2，后台可配默认 V1）、形象 ID（后台配置表）、画布对齐模板 project_settings。
 * 授权：形象授权状态由上层（media-assets 元数据）强制校验，本适配器只负责合成调用。
 * 端点/状态值可配置（联调确认最终路径），纯逻辑可单测。
 */
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface VolcanoDigitalHumanConfig {
  /** 数字人服务端点 */
  endpoint: string;
  apiKey: string;
  /** 提交任务路径（默认 /digital-human/submit） */
  submitPath?: string;
  /** 任务查询路径（默认 /digital-human/query，GET ?task_id=） */
  queryPath?: string;
  /** 模型版本（默认 V1） */
  modelVersion?: 'V1' | 'V2';
  /** 轮询间隔（默认 3000ms） */
  pollIntervalMs?: number;
  /** 最大轮询次数（默认 120 ≈ 6 分钟） */
  maxAttempts?: number;
  timeoutMs?: number;
  /** 成功状态值 */
  successStatuses?: string[];
  /** 失败状态值 */
  failedStatuses?: string[];
}

export interface DigitalHumanJobOptions {
  /** TTS 产物音频（OSS URL，供数字人对口型） */
  audioUrl: string;
  /** 数字人形象 ID（后台配置表主键/云端 ID） */
  digitalHumanId: string;
  modelVersion?: 'V1' | 'V2';
  /** 画布（对齐模板 project_settings 宽高，默认 1080x1920） */
  canvas?: { width: number; height: number };
  userId?: number;
}

export interface DigitalHumanResult {
  /** 产物视频 URL（OSS 直链/临时签名） */
  videoUrl: string;
  taskId: string;
  modelVersion: string;
}

export class DigitalHumanError extends Error {
  name = 'DigitalHumanError';
  constructor(message: string) {
    super(message);
  }
}

@Injectable()
export class DigitalHumanAdapter {
  private readonly logger = new Logger(DigitalHumanAdapter.name);

  constructor(private readonly config?: VolcanoDigitalHumanConfig) {}

  private cfg(): VolcanoDigitalHumanConfig {
    if (this.config) return this.config;
    const endpoint = process.env.VOLCANO_DIGITAL_HUMAN_ENDPOINT || '';
    const apiKey = process.env.VOLCANO_ARK_API_KEY || '';
    if (!endpoint || !apiKey) {
      throw new DigitalHumanError('未配置数字人服务端点/密钥（VOLCANO_DIGITAL_HUMAN_ENDPOINT / VOLCANO_ARK_API_KEY）');
    }
    return {
      endpoint,
      apiKey,
      submitPath: process.env.VOLCANO_DH_SUBMIT_PATH || '/digital-human/submit',
      queryPath: process.env.VOLCANO_DH_QUERY_PATH || '/digital-human/query',
      modelVersion: (process.env.VOLCANO_DH_MODEL_VERSION as 'V1' | 'V2') || 'V1',
      pollIntervalMs: Number(process.env.VOLCANO_DH_POLL_INTERVAL_MS || 3000),
      maxAttempts: Number(process.env.VOLCANO_DH_MAX_ATTEMPTS || 120),
      timeoutMs: Number(process.env.VOLCANO_REQUEST_TIMEOUT_MS || 60000),
      successStatuses: ['success', 'done', 'succeeded'],
      failedStatuses: ['failed', 'error', 'cancelled'],
    };
  }

  private url(endpoint: string, p: string): string {
    return endpoint.replace(/\/+$/, '') + (p.startsWith('/') ? p : '/' + p);
  }

  /** 提交数字人合成任务 → taskId */
  async submitJob(opts: DigitalHumanJobOptions): Promise<string> {
    const cfg = this.cfg();
    const body: Record<string, unknown> = {
      model_version: opts.modelVersion || cfg.modelVersion || 'V1',
      digital_human_id: opts.digitalHumanId,
      audio_url: opts.audioUrl,
      canvas: opts.canvas || { width: 1080, height: 1920 },
    };
    if (opts.userId) body.user_id = opts.userId;
    const resp = await fetch(this.url(cfg.endpoint, cfg.submitPath!), {
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
      throw new DigitalHumanError('数字人任务提交失败: HTTP ' + resp.status + ' ' + txt.slice(0, 300));
    }
    const data = (await resp.json()) as { data?: { task_id?: string }; task_id?: string; code?: number; message?: string };
    const taskId = data?.data?.task_id || data?.task_id;
    if (!taskId) throw new DigitalHumanError('数字人任务提交未返回 task_id: ' + JSON.stringify(data).slice(0, 300));
    return taskId;
  }

  /** 查询任务状态（可被测试注入 sleep 替代真实等待） */
  async queryJob(taskId: string, sleepFn: (ms: number) => Promise<void> = sleep): Promise<{ status: string; videoUrl?: string }> {
    const cfg = this.cfg();
    let attempts = 0;
    const maxAttempts = cfg.maxAttempts || 120;
    while (attempts < maxAttempts) {
      attempts += 1;
      const sep = cfg.queryPath!.includes('?') ? '&' : '?';
      const resp = await fetch(this.url(cfg.endpoint, cfg.queryPath!) + sep + 'task_id=' + encodeURIComponent(taskId), {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + cfg.apiKey },
        signal: AbortSignal.timeout(cfg.timeoutMs || 60000),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new DigitalHumanError('数字人任务查询失败: HTTP ' + resp.status + ' ' + txt.slice(0, 300));
      }
      const data = (await resp.json()) as {
        data?: { status?: string; video_url?: string; videoUrl?: string };
        status?: string;
        video_url?: string;
        videoUrl?: string;
      };
      const status = String(data?.data?.status || data?.status || '').toLowerCase();
      const videoUrl = data?.data?.video_url || data?.video_url || data?.data?.videoUrl || data?.videoUrl;
      if (cfg.failedStatuses?.includes(status)) {
        throw new DigitalHumanError('数字人合成失败，状态: ' + status);
      }
      if (cfg.successStatuses?.includes(status)) {
        if (!videoUrl) throw new DigitalHumanError('数字人任务成功但缺少 video_url');
        return { status, videoUrl };
      }
      this.logger.debug('[oral-workshop] 数字人任务轮询: ' + taskId + ' status=' + status);
      await sleepFn(cfg.pollIntervalMs || 3000);
    }
    throw new DigitalHumanError('数字人任务超时（' + maxAttempts + ' 次轮询）');
  }

  /** 总入口：提交 + 轮询 → 产物视频 URL */
  async generate(opts: DigitalHumanJobOptions): Promise<DigitalHumanResult> {
    const cfg = this.cfg();
    const taskId = await this.submitJob(opts);
    const { videoUrl } = await this.queryJob(taskId);
    if (!videoUrl) throw new DigitalHumanError('数字人任务成功但缺少 video_url');
    return {
      videoUrl,
      taskId,
      modelVersion: opts.modelVersion || cfg.modelVersion || 'V1',
    };
  }
}

/** 默认等待（可替换以便测试） */
async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}
import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { lookup as dnsLookup } from 'dns/promises';
import { MediaJobEntity, MediaJobType } from './entities/media-job.entity';
import { GenerateImageDto, GenerateVideoDto, MediaJobQueryDto } from './dto/generate-media.dto';
import { GenerationClientService, GenerationAdapterConfig } from './generation-client.service';
import { ModelEntity } from '../model/entities/model.entity';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { FileEntity } from '../file/entities/file.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { CreditsService } from '../credits/services/credits.service';
import { PricingService } from '../credits/services/pricing.service';
import { resolveRelay } from '../admin-model/utils/relay-resolver';

const DEFAULT_IMAGE_PRICE = 10; // 积分/张（模型未配置时）
const GENERATED_DIR = './uploads/files/generated';

/** 可对外暴露的生成模型信息 */
export interface GenerationModelItem {
  id: string;
  name: string;
  type: 'image' | 'video';
  provider: string;
  generationParams: Record<string, unknown>;
  pricePerImage?: number | null;
  videoPrices: Record<string, Record<string, number>>;
}

@Injectable()
export class MediaGenerationService implements OnModuleInit {
  private readonly logger = new Logger(MediaGenerationService.name);

  constructor(
    @InjectRepository(MediaJobEntity) private readonly jobRepo: Repository<MediaJobEntity>,
    @InjectRepository(ModelEntity) private readonly modelRepo: Repository<ModelEntity>,
    @InjectRepository(ModelProviderEntity) private readonly providerRepo: Repository<ModelProviderEntity>,
    @InjectRepository(FileEntity) private readonly fileRepo: Repository<FileEntity>,
    private readonly genClient: GenerationClientService,
    private readonly encryptionService: EncryptionService,
    private readonly creditsService: CreditsService,
    private readonly pricingService: PricingService,
  ) {}

  health() { return { status: 'ok', module: 'media-generation' }; }

  /**
   * 启动时回收孤儿任务：进程重启后未完成的生成任务无法继续轮询，
   * 统一置为失败并退还冻结积分，避免积分永久冻结。
   */
  async onModuleInit(): Promise<void> {
    const orphans = await this.jobRepo.find({
      where: [{ status: 'pending' }, { status: 'processing' }],
    });
    for (const job of orphans) {
      job.status = 'failed';
      job.error = '服务重启导致任务中断，积分已退还';
      await this.jobRepo.save(job);
      if (job.frozenTxnId) {
        try {
          await this.creditsService.refundCredits(job.userId, job.frozenTxnId);
        } catch (e) {
          this.logger.warn(`孤儿任务退款失败 job#${job.id}: ${(e as Error).message}`);
        }
      }
    }
    if (orphans.length > 0) {
      this.logger.log(`已回收 ${orphans.length} 个中断的生成任务并退还积分`);
    }
  }

  // ============ 模型列表 ============

  /** 用户端可选生成模型（仅已上架 + 已配好凭据的 image/video 模型） */
  async listGenerationModels(): Promise<GenerationModelItem[]> {
    const models = await this.modelRepo.find({ where: { isActive: true }, order: { createdAt: 'DESC' } });
    const out: GenerationModelItem[] = [];
    for (const m of models) {
      if (m.modelType !== 'image' && m.modelType !== 'image_edit' && m.modelType !== 'video') continue;
      const provider = m.providerId
        ? await this.providerRepo.findOne({ where: { id: m.providerId, status: 'active' } })
        : null;
      if (!provider?.apiKey || !provider?.baseUrl) continue;
      out.push({
        id: m.modelId,
        name: m.name,
        type: (m.modelType === 'image_edit' ? 'image' : m.modelType) as 'image' | 'video',
        provider: provider.slug,
        generationParams: m.generationParams ?? {},
        pricePerImage: m.pricePerImage,
        videoPrices: m.videoPrices ?? {},
      });
    }
    return out;
  }

  // ============ 内部解析 ============

  private async resolveModel(modelId: string, type: MediaJobType): Promise<{ model: ModelEntity; provider: ModelProviderEntity; adapter: GenerationAdapterConfig; decryptedKey: string }> {
    const model = await this.modelRepo.findOne({ where: { modelId, isActive: true } });
    if (!model || (model.modelType !== 'image' && model.modelType !== 'video')) {
      throw new BadRequestException('生成模型不存在或未上架');
    }
    if (model.modelType !== type) {
      throw new BadRequestException(`模型类型不匹配：${model.modelType}`);
    }
    // 1) 模型绑定供应商优先；2) 无绑定/停用 → 全局中转（严格单全局，老数据回退第一个 active 供应商）
    let provider = model.providerId
      ? await this.providerRepo.findOne({ where: { id: model.providerId, status: 'active' } })
      : null;
    if (!provider) {
      provider = await resolveRelay(this.providerRepo);
    }
    if (!provider?.apiKey || !provider?.baseUrl) {
      throw new BadRequestException('模型未关联可用供应商凭据（Base URL / API Key）');
    }
    let decrypted = '';
    try { decrypted = this.encryptionService.decryptAes(provider.apiKey as string); } catch { /* ignore */ }
    if (!decrypted) throw new BadRequestException('供应商 API Key 解密失败');
    // 视频：模型级提交/查询后缀优先（generation_params.video_submit_path / video_query_path），
    // 未配置时兼容老供应商 config.generation 适配模板
    const baseAdapter = (provider.config?.generation ?? {}) as GenerationAdapterConfig;
    const gen = (model.generationParams ?? {}) as Record<string, unknown>;
    const adapter: GenerationAdapterConfig = {
      ...baseAdapter,
      ...(gen.video_submit_path ? { videosPath: String(gen.video_submit_path) } : {}),
      ...(gen.video_query_path ? { taskPath: String(gen.video_query_path) } : {}),
    };
    return { model, provider, adapter, decryptedKey: decrypted };
  }

  /** 计算并预扣积分，返回 { price, frozenTxnId } */
  private async charge(
    userId: number,
    model: ModelEntity,
    opts: { resolution?: string; duration?: number },
    sourceId: string,
  ): Promise<{ price: number; frozenTxnId: number | null }> {
    let base = 0;
    if (model.modelType === 'image') {
      base = model.pricePerImage ?? DEFAULT_IMAGE_PRICE;
    } else {
      // 视频价格严格按 分辨率×时长 矩阵扣费：未配置的规格直接拒绝，避免静默扣默认价
      const matrix = model.videoPrices?.[opts.resolution ?? ''];
      const priceAt = matrix?.[String(opts.duration ?? 5)];
      if (priceAt === undefined) {
        throw new BadRequestException(`该模型未配置 ${opts.resolution ?? ''}/${opts.duration ?? 5} 秒的视频生成价格`);
      }
      base = priceAt;
    }
    const level = await this.pricingService.getUserLevel(userId);
    const price = this.pricingService.applyDiscount(Math.round(base), level);
    // 单价为 0 的免费模型：跳过冻结/结算，不产生积分流水
    if (price <= 0) return { price: 0, frozenTxnId: null };
    const frozen = await this.creditsService.freezeCredits(userId, price, 'media_generation' as any, sourceId);
    return { price, frozenTxnId: frozen.id };
  }

  /** 校验上游产物 URL：仅允许 http/https，并拦截内网/保留地址（防 SSRF） */
  private async validateResultUrl(rawUrl: string): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException('上游返回的产物 URL 无效');
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('上游返回的产物 URL 协议不受支持');
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isPrivate = (ip: string): boolean => {
      const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (!m) return false;
      const a = Number(m[1]); const b = Number(m[2]);
      return (
        a === 10 || a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254) ||
        (a === 100 && b >= 64 && b <= 127) ||
        a === 0
      );
    };
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === '::1' || hostname === '0.0.0.0') {
      throw new BadRequestException('上游返回的产物 URL 指向内网地址');
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      if (isPrivate(hostname)) throw new BadRequestException('上游返回的产物 URL 指向内网地址');
      return rawUrl;
    }
    try {
      const addresses = await dnsLookup(hostname, { all: true });
      if (addresses.some(({ address }) => isPrivate(address))) {
        throw new BadRequestException('上游返回的产物 URL 指向内网地址');
      }
    } catch (err) {
      // DNS 解析失败/超时：放行让 fetch 自行处理，避免误伤公网 CDN
      this.logger.warn(`产物 URL 域名解析跳过校验: ${hostname} - ${(err as Error).message}`);
    }
    return rawUrl;
  }

  /** 产物落盘并登记文件记录 */
  private async saveGeneratedMedia(
    userId: number,
    kind: 'image' | 'video',
    result: { b64?: string; url?: string },
  ): Promise<string> {
    if (!fs.existsSync(GENERATED_DIR)) fs.mkdirSync(GENERATED_DIR, { recursive: true });
    const name = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let buffer: Buffer;
    let ext = kind === 'image' ? 'png' : 'mp4';
    let mime = kind === 'image' ? 'image/png' : 'video/mp4';

    if (result.b64) {
      buffer = Buffer.from(result.b64, 'base64');
    } else if (result.url) {
      const safeUrl = await this.validateResultUrl(result.url);
      const res = await fetch(safeUrl, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new BadRequestException(`下载生成产物失败(${res.status})`);
      const contentLength = Number(res.headers.get('content-length') || 0);
      if (contentLength > 512 * 1024 * 1024) {
        throw new BadRequestException('生成产物超过 512MB 大小限制');
      }
      buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > 512 * 1024 * 1024) {
        throw new BadRequestException('生成产物超过 512MB 大小限制');
      }
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('jpeg')) { ext = 'jpg'; mime = 'image/jpeg'; }
      else if (ct.includes('png')) { ext = 'png'; mime = 'image/png'; }
      else if (ct.includes('webm')) { ext = 'webm'; mime = 'video/webm'; }
      else if (ct.includes('quicktime')) { ext = 'mov'; mime = 'video/quicktime'; }
    } else {
      throw new BadRequestException('上游未返回产物');
    }

    const fileName = `${name}.${ext}`;
    fs.writeFileSync(path.join(GENERATED_DIR, fileName), buffer);
    const relPath = `/uploads/files/generated/${fileName}`;
    await this.fileRepo.save(this.fileRepo.create({
      userId,
      name: fileName,
      path: relPath,
      size: buffer.length,
      mimeType: mime,
      storageType: 'minio',
    } as Partial<FileEntity>));
    return relPath;
  }

  // ============ 文生图 ============

  async generateImage(userId: number, dto: GenerateImageDto) {
    const { model, provider, adapter, decryptedKey } = await this.resolveModel(dto.modelId, 'image');
    const sourceId = `media-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { price, frozenTxnId } = await this.charge(userId, model, {}, sourceId);

    let job = await this.jobRepo.save(this.jobRepo.create({
      userId,
      modelId: dto.modelId,
      type: 'image',
      prompt: dto.prompt,
      params: { size: dto.size ?? null },
      status: 'processing',
      creditsCost: price,
      frozenTxnId,
    }));

    try {
      const result = await this.genClient.generateImage({
        endpoint: provider.baseUrl,
        apiKey: decryptedKey,
        adapter,
        model: model.upstreamModelId || model.modelId,
        prompt: dto.prompt,
        size: dto.size,
      });
      const relPath = await this.saveGeneratedMedia(userId, 'image', result);
      job.status = 'done';
      job.resultUrls = [relPath];
      job = await this.jobRepo.save(job);
      if (frozenTxnId) await this.creditsService.settleCredits(userId, frozenTxnId, price);
      return this.toJobItem(job);
    } catch (err) {
      job.status = 'failed';
      job.error = (err as Error).message?.slice(0, 500);
      await this.jobRepo.save(job);
      try { if (frozenTxnId) await this.creditsService.refundCredits(userId, frozenTxnId); } catch (e) { this.logger.warn(`图片退款失败: ${(e as Error).message}`); }
      throw err;
    }
  }

  // ============ 文生视频（异步任务） ============

  async generateVideo(userId: number, dto: GenerateVideoDto) {
    const { model, provider, adapter, decryptedKey } = await this.resolveModel(dto.modelId, 'video');
    const sourceId = `media-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { price, frozenTxnId } = await this.charge(userId, model, { resolution: dto.resolution, duration: dto.duration }, sourceId);

    const job = await this.jobRepo.save(this.jobRepo.create({
      userId,
      modelId: dto.modelId,
      type: 'video',
      prompt: dto.prompt,
      params: { resolution: dto.resolution ?? null, duration: dto.duration ?? 5, fps: dto.fps ?? null },
      status: 'pending',
      creditsCost: price,
      frozenTxnId,
    }));

    void this.runVideoJob(job.id, {
      endpoint: provider.baseUrl,
      apiKey: decryptedKey,
      adapter,
      model: model.upstreamModelId || model.modelId,
      prompt: dto.prompt,
      resolution: dto.resolution,
      duration: dto.duration ?? 5,
      fps: dto.fps,
    });
    return this.toJobItem(job);
  }

  private async runVideoJob(
    jobId: number,
    cfg: { endpoint: string; apiKey: string; adapter: GenerationAdapterConfig; model: string; prompt: string; resolution?: string; duration: number; fps?: number },
  ) {
    try {
      const { taskId } = await this.genClient.submitVideo(cfg);
      await this.jobRepo.update(jobId, { status: 'processing', params: { ...(await this.jobRepo.findOne({ where: { id: jobId } }))?.params, externalTaskId: taskId } });

      const interval = (cfg.adapter.pollInterval || 5) * 1000;
      const maxAttempts = Math.ceil((cfg.adapter.timeoutMs || 10 * 60 * 1000) / interval);
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await this.sleep(interval);
        let status: 'processing' | 'done' | 'failed' = 'processing';
        let url: string | undefined;
        try {
          const r = await this.genClient.pollVideoTask({ endpoint: cfg.endpoint, apiKey: cfg.apiKey, adapter: cfg.adapter, taskId });
          status = r.status; url = r.url;
        } catch (err) {
          this.logger.warn(`视频任务轮询异常(attempt ${attempt}): ${(err as Error).message}`);
          continue;
        }
        if (status === 'done') {
          const job = await this.jobRepo.findOne({ where: { id: jobId } });
          if (!job) return;
          try {
            const relPath = await this.saveGeneratedMedia(job.userId, 'video', { url });
            job.status = 'done';
            job.resultUrls = [relPath];
            await this.jobRepo.save(job);
            if (job.frozenTxnId) await this.creditsService.settleCredits(job.userId, job.frozenTxnId, job.creditsCost);
          } catch (err) {
            job.status = 'failed';
            job.error = (err as Error).message?.slice(0, 500);
            await this.jobRepo.save(job);
            try { if (job.frozenTxnId) await this.creditsService.refundCredits(job.userId, job.frozenTxnId); } catch (e) { this.logger.warn(`视频退款失败: ${(e as Error).message}`); }
          }
          return;
        }
        if (status === 'failed') {
          const job = await this.jobRepo.findOne({ where: { id: jobId } });
          if (!job) return;
          job.status = 'failed';
          job.error = '上游任务失败';
          await this.jobRepo.save(job);
          try { if (job.frozenTxnId) await this.creditsService.refundCredits(job.userId, job.frozenTxnId); } catch (e) { this.logger.warn(`视频退款失败: ${(e as Error).message}`); }
          return;
        }
      }
      // 超时
      const job = await this.jobRepo.findOne({ where: { id: jobId } });
      if (job && job.status !== 'done') {
        job.status = 'failed';
        job.error = '生成超时';
        await this.jobRepo.save(job);
        try { if (job.frozenTxnId) await this.creditsService.refundCredits(job.userId, job.frozenTxnId); } catch (e) { this.logger.warn(`视频超时退款失败: ${(e as Error).message}`); }
      }
    } catch (err) {
      const job = await this.jobRepo.findOne({ where: { id: jobId } });
      if (job) {
        job.status = 'failed';
        job.error = (err as Error).message?.slice(0, 500);
        await this.jobRepo.save(job);
        try { if (job.frozenTxnId) await this.creditsService.refundCredits(job.userId, job.frozenTxnId); } catch (e) { this.logger.warn(`视频提交失败退款: ${(e as Error).message}`); }
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============ 任务查询 ============

  async getJob(userId: number, id: number) {
    const job = await this.jobRepo.findOne({ where: { id, userId } });
    if (!job) throw new NotFoundException('生成任务不存在');
    return this.toJobItem(job);
  }

  async listJobs(userId: number, query: MediaJobQueryDto) {
    const page = Math.max(query.page || 1, 1);
    const pageSize = Math.max(query.pageSize || 20, 1);
    const where: any = { userId };
    if (query.type) where.type = query.type;
    const [items, total] = await this.jobRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { list: items.map((j) => this.toJobItem(j)), total, page, pageSize };
  }

  private toJobItem(job: MediaJobEntity) {
    return {
      id: job.id,
      modelId: job.modelId,
      type: job.type,
      prompt: job.prompt,
      params: job.params ?? {},
      status: job.status,
      resultUrls: job.resultUrls ?? [],
      creditsCost: job.creditsCost,
      error: job.error ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }
}

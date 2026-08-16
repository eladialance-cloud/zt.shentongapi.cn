import { Injectable, Logger, BadRequestException, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { lookup as dnsLookup } from 'dns/promises';
import { MediaJobEntity, MediaJobType } from './entities/media-job.entity';
import { GenerateImageDto, GenerateVideoDto, MediaJobQueryDto } from './dto/generate-media.dto';
import { GenerationClientService, GenerationAdapterConfig, mergeGenerationAdapter, buildMediaGenerationAdapter } from './generation-client.service';
import { computeVideoCharge, normalizeResolutionTier } from './billing';
import { ModelEntity } from '../model/entities/model.entity';
import { ModelProviderEntity } from '../admin-model/entities/model-provider.entity';
import { FileEntity } from '../file/entities/file.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { CreditsService } from '../credits/services/credits.service';
import { PricingService } from '../credits/services/pricing.service';
import { OssUploadService } from '../admin-oss/oss-upload.service';
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
    private readonly ossUpload: OssUploadService,
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
    // 与 resolveModel 保持一致：模型未绑定供应商时回退到全局中转/首个可用供应商，
    // 否则后台添加的图片/视频模型即使生成时能兜底，桌面端列表也看不到
    const relay = await resolveRelay(this.providerRepo);
    const out: GenerationModelItem[] = [];
    for (const m of models) {
      if (m.modelType !== 'image' && m.modelType !== 'image_edit' && m.modelType !== 'video') continue;
      const bound = m.providerId
        ? await this.providerRepo.findOne({ where: { id: m.providerId, status: 'active' } })
        : null;
      const provider = bound ?? (relay && relay.status === 'active' ? relay : null);
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
    if (!model || (model.modelType !== 'image' && model.modelType !== 'image_edit' && model.modelType !== 'video')) {
      throw new BadRequestException('生成模型不存在或未上架');
    }
    // type='image' 时允许 image_edit（listGenerationModels 已把 image_edit 以 type:'image' 下发给用户端）
    const typeMatched = type === 'image' ? (model.modelType === 'image' || model.modelType === 'image_edit') : model.modelType === type;
    if (!typeMatched) {
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
    // 模型级 generationParams 覆盖优先（video_submit_path / task_id_path / request_template 等），
    // 未配置时兼容老供应商 config.generation 适配模板；与 admin 测试连接共用同一合并逻辑
    const adapter: GenerationAdapterConfig = buildMediaGenerationAdapter(
      provider,
      model.generationParams,
    );
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
    if (model.modelType === 'image' || model.modelType === 'image_edit') {
      base = model.pricePerImage ?? DEFAULT_IMAGE_PRICE;
    } else {
      // 视频按秒计费：per_second 取 video_per_second[分辨率]x时长，未配置档直接拒绝；否则回退旧价格矩阵
      const price = computeVideoCharge(model, { resolution: opts.resolution, duration: opts.duration ?? 5 });
      const tierKey = normalizeResolutionTier(opts.resolution ?? '');
      if (model.pricingMode === 'per_second') {
        const hasTier = Object.keys(model.videoPerSecond ?? {}).some(
          (k) => normalizeResolutionTier(k) === tierKey,
        );
        if (!hasTier) {
          throw new BadRequestException(`该模型未配置 ${tierKey || '默认'} 分辨率档的视频每秒价格`);
        }
      } else if (!Object.keys(model.videoPrices ?? {}).some((k) => normalizeResolutionTier(k) === tierKey)) {
        throw new BadRequestException(`该模型未配置 ${tierKey || '默认'}/${opts.duration ?? 5} 秒的视频生成价格`);
      }
      base = price;
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

  /** 校验输入图（仅 http(s) URL 或 data:image 数据 URI，最多 4 张），URL 复用 SSRF 校验 */
  async validateInputImages(images: string[] | undefined): Promise<string[]> {
    if (!images?.length) return [];
    if (images.length > 4) throw new BadRequestException('输入图片最多 4 张');
    const out: string[] = [];
    for (const img of images) {
      if (typeof img !== 'string' || !img.trim()) {
        throw new BadRequestException('输入图片格式无效');
      }
      const v = img.trim();
      if (/^data:image\//i.test(v)) {
        out.push(v);
        continue;
      }
      if (/^https?:\/\//i.test(v)) {
        out.push(await this.validateResultUrl(v));
        continue;
      }
      throw new BadRequestException('输入图片仅支持 http(s) URL 或 data:image 数据 URI');
    }
    return out;
  }

  /** 产物落盘并登记文件记录 */
  private async saveGeneratedMedia(
    userId: number,
    kind: 'image' | 'video',
    callMode: string,
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
    let targetPath: string;
    let storageType: 'minio' | 'oss' | 'cos' = 'minio';
    try {
      const oss = await this.ossUpload.upload(buffer, { userId, callMode, ext, mime });
      if (oss) {
        targetPath = oss.url;
        storageType = oss.storageType;
      } else {
        // 未配置 OSS / provider=local：回退本地落盘（与上传失败降级共用 saveLocalFallback）
        this.logger.debug(`OSS 未启用（upload 返回 null），回退本地落盘: ${fileName}`);
        targetPath = this.saveLocalFallback(fileName, buffer);
      }
    } catch (e) {
      // OSS 上传失败降级本地，避免产物丢失
      this.logger.warn(`OSS 上传失败，回退本地落盘: ${(e as Error).message}`);
      targetPath = this.saveLocalFallback(fileName, buffer);
    }
    await this.fileRepo.save(this.fileRepo.create({
      userId,
      name: fileName,
      path: targetPath,
      size: buffer.length,
      mimeType: mime,
      storageType,
    } as Partial<FileEntity>));
    return targetPath;
  }

  /** 本地落盘回退：写入 GENERATED_DIR 并返回相对 URL（OSS 未配置 / 上传失败共用） */
  private saveLocalFallback(fileName: string, buffer: Buffer): string {
    fs.writeFileSync(path.join(GENERATED_DIR, fileName), buffer);
    return `/uploads/files/generated/${fileName}`;
  }

  // ============ 文生图 ============

  async generateImage(userId: number, dto: GenerateImageDto) {
    const { model, provider, adapter, decryptedKey } = await this.resolveModel(dto.modelId, 'image');
    const rawInputs = await this.validateInputImages(dto.inputImages);
    if (model.modelType === 'image_edit' && rawInputs.length === 0) {
      throw new BadRequestException('图像编辑需要上传一张参考图（图生图）');
    }
    // 模板内嵌图分支：data URI 参考图先传 OSS 换公网 URL（DashScope base_image_url 需公网可访问）
    const adapter0 = adapter;
    let inputImages = rawInputs;
    if (
      rawInputs.some((v) => /^data:image\//i.test(v)) &&
      adapter0.imagesStyle !== 'multipart' &&
      (adapter0.imageRequestTemplate || adapter0.requestTemplate)
    ) {
      const resolved: string[] = [];
      for (const v of rawInputs) {
        if (/^https?:\/\//i.test(v)) { resolved.push(v); continue; }
        if (!/^data:image\//i.test(v)) throw new BadRequestException('参考图仅支持公网 URL 或 data:image 数据');
        const m = v.match(/^data:([^;]+);base64,([\s\S]+)$/);
        if (!m) throw new BadRequestException('参考图 data URI 格式无效');
        const mime = m[1] || 'image/png';
        const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('png') ? 'png' : 'bin';
        const up = await this.ossUpload.upload(Buffer.from(m[2], 'base64'), {
          userId,
          callMode: 'image_edit_input',
          ext,
          mime,
        });
        if (!up?.url) throw new BadRequestException('参考图上传 OSS 失败：请直接提供公网图片 URL');
        resolved.push(up.url);
      }
      inputImages = resolved;
    }
    const sourceId = `media-image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { price, frozenTxnId } = await this.charge(userId, model, {}, sourceId);

    let job = await this.jobRepo.save(this.jobRepo.create({
      userId,
      modelId: dto.modelId,
      type: 'image',
      callMode: 'image',
      prompt: dto.prompt,
      params: { size: dto.size ?? null, inputImages: inputImages.map((v) => v.slice(0, 128)) },
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
        inputImages,
      });
      const relPath = await this.saveGeneratedMedia(userId, 'image', 'image', result);
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
    // 图生视频：首帧图 data URI 转 OSS 公网 URL（http(s) 直接用）
    let firstFrameUrl: string | undefined;
    if (dto.inputImages?.length) {
      const raw = dto.inputImages[0];
      if (/^https?:\/\//i.test(raw)) {
        firstFrameUrl = raw;
      } else if (/^data:image\//i.test(raw)) {
        const m = raw.match(/^data:([^;]+);base64,([\s\S]+)$/);
        if (!m) throw new BadRequestException('首帧图 data URI 格式无效');
        const mime = m[1] || 'image/png';
        const ext = mime.includes('jpeg') ? 'jpg' : mime.includes('png') ? 'png' : 'bin';
        const up = await this.ossUpload.upload(Buffer.from(m[2], 'base64'), {
          userId,
          callMode: 'video_input',
          ext,
          mime,
        });
        if (!up?.url) throw new BadRequestException('首帧图上传 OSS 失败：请直接提供公网图片 URL');
        firstFrameUrl = up.url;
      } else {
        throw new BadRequestException('首帧图仅支持公网 URL 或 data:image 数据');
      }
    }
    const sourceId = `media-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { price, frozenTxnId } = await this.charge(userId, model, { resolution: dto.resolution, duration: dto.duration }, sourceId);

    const job = await this.jobRepo.save(this.jobRepo.create({
      userId,
      modelId: dto.modelId,
      type: 'video',
      callMode: 'video',
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
      inputImages: firstFrameUrl ? [firstFrameUrl] : undefined,
    });
    return this.toJobItem(job);
  }

  /** 通用调用模式任务登记（P1 仅创建任务记录；执行器/计费 P5 接入） */
  async createCallModeJob(
    userId: number,
    dto: { modelId: string; prompt?: string; params?: Record<string, unknown> },
    callMode: string,
  ) {
    const job = await this.jobRepo.save(this.jobRepo.create({
      userId,
      modelId: dto.modelId,
      type: callMode,
      callMode,
      prompt: dto.prompt ?? '',
      params: dto.params ?? {},
      status: 'pending',
      creditsCost: 0,
      frozenTxnId: null,
    }));
    return this.toJobItem(job);
  }

  private async runVideoJob(
    jobId: number,
    cfg: { endpoint: string; apiKey: string; adapter: GenerationAdapterConfig; model: string; prompt: string; resolution?: string; duration: number; fps?: number; inputImages?: string[] },
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
            const relPath = await this.saveGeneratedMedia(job.userId, 'video', job.callMode ?? 'video', { url });
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
      callMode: job.callMode ?? null,
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

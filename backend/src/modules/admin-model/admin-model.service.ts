import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ModelEntity } from '../model/entities/model.entity';
import { ModelProviderEntity } from './entities/model-provider.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { TestModelDto } from './dto/test-model.dto';
import { FetchModelsDto } from './dto/fetch-models.dto';
import { ImportModelsDto } from './dto/import-models.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { TestProviderDto } from './dto/test-provider.dto';
import { ImportProviderModelsDto } from './dto/import-provider-models.dto';
import {
  buildSlug,
  buildUniqueModelId,
  parseUpstreamModels,
} from './utils/provider-utils';

/** 模型查询参数 */
interface ModelQuery {
  provider?: string;
  enabled?: boolean | string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 管理端大模型配置服务
 *
 * 供应商体系（v0.7.0+）：
 * - 新增模型不再走"单模型表单"，改为：添加第三方供应商(名称+Base URL+API Key)
 *   -> 测试连接 -> 读取上游模型列表 -> 勾选 -> 逐模型定价(积分/千token) -> 确定模型类型 -> 导入
 * - 导入后的模型展示在模型管理页，可编辑(显示名/类型标签/积分单价/能力)、上下架、删除
 * - 上游真实调用凭据(baseUrl + apiKey)归属 model_providers，模型表只存 provider_id + upstream_model_id
 */
@Injectable()
export class AdminModelService {
  constructor(
    @InjectRepository(ModelEntity)
    private modelRepo: Repository<ModelEntity>,
    @InjectRepository(ModelProviderEntity)
    private providerRepo: Repository<ModelProviderEntity>,
    private encryption: EncryptionService,
  ) {}

  // ============ 模型列表与详情 ============

  /** 模型列表（分页） */
  async list(query: ModelQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.modelRepo.createQueryBuilder('m');

    if (query.provider) {
      qb.andWhere('m.provider = :provider', { provider: query.provider });
    }
    if (query.enabled === true || query.enabled === 'true') {
      qb.andWhere('m.is_active = :active', { active: true });
    } else if (query.enabled === false || query.enabled === 'false') {
      qb.andWhere('m.is_active = :active', { active: false });
    }
    if (query.keyword) {
      qb.andWhere('(m.model_id LIKE :kw OR m.name LIKE :kw OR m.upstream_model_id LIKE :kw)', {
        kw: `%${query.keyword}%`,
      });
    }

    qb.orderBy('m.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    const providerMap = await this.loadProviderNameMap(items);
    return {
      list: items.map((m) => this.toAdminModelItem(m, providerMap.get(m.providerId ?? -1))),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 模型详情 */
  async detail(id: number) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    const provider = model.providerId
      ? await this.providerRepo.findOne({ where: { id: model.providerId } })
      : null;
    return this.toAdminModelItem(model, provider);
  }

  // ============ 模型增删改 ============

  /** 新增模型（兼容旧接口；新流程请使用供应商导入） */
  async create(dto: CreateModelDto) {
    const entity = new ModelEntity();
    this.applyCreateDto(entity, dto);
    const saved = await this.modelRepo.save(entity);
    await this.refreshProviderModelCount(saved.providerId);
    return this.toAdminModelItem(saved);
  }

  /** 编辑模型（显示名/类型标签/积分单价/能力/上下架等） */
  async update(id: number, dto: UpdateModelDto) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    this.applyUpdateDto(model, dto);
    await this.modelRepo.save(model);
  }

  /** 删除模型 */
  async remove(id: number) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    const providerId = model.providerId;
    await this.modelRepo.delete(id);
    await this.refreshProviderModelCount(providerId);
  }

  // ============ 启用 / 禁用 ============

  /** 启用模型（上架） */
  async enable(id: number) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    model.isActive = true;
    await this.modelRepo.save(model);
  }

  /** 禁用模型（下架） */
  async disable(id: number) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    model.isActive = false;
    await this.modelRepo.save(model);
  }

  // ============ 模型测试 / 同步 ============

  /** 模型测试：优先使用供应商凭据(baseUrl+apiKey) + upstreamModelId 调上游 */
  async test(id: number, dto: TestModelDto) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    const provider = model.providerId
      ? await this.providerRepo.findOne({ where: { id: model.providerId } })
      : null;
    const apiKey = provider?.apiKey
      ? this.encryption.decryptAes(provider.apiKey)
      : model.apiKey
        ? this.encryption.decryptAes(model.apiKey)
        : '';
    const endpoint = provider?.baseUrl || model.apiEndpoint || '';
    const upstreamModelId = model.upstreamModelId || model.modelId;
    if (!apiKey || !endpoint) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '模型未关联供应商凭据，无法测试');
    }
    try {
      const response = await this.callModelApi(endpoint, apiKey, upstreamModelId, dto.input);
      model.connectionStatus = 'connected';
      model.lastTestedAt = new Date();
      await this.modelRepo.save(model);
      if (provider) {
        provider.connectionStatus = 'connected';
        provider.lastTestedAt = new Date();
        await this.providerRepo.save(provider);
      }
      return { success: true, response };
    } catch (err: any) {
      model.connectionStatus = 'failed';
      model.lastTestedAt = new Date();
      await this.modelRepo.save(model);
      if (provider) {
        provider.connectionStatus = 'failed';
        provider.lastTestedAt = new Date();
        await this.providerRepo.save(provider);
      }
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, `模型测试失败: ${err?.message || err}`);
    }
  }

  /** 手动同步 OpenClaw（占位实现） */
  async sync(id: number) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    // 占位：实际同步逻辑由后续任务接入 OpenClaw 实现
  }

  // ============ 供应商体系 ============

  /** 供应商列表 */
  async providerList() {
    const providers = await this.providerRepo.find({
      order: { createdAt: 'DESC' },
    });
    return providers.map((p) => this.toProviderItem(p));
  }

  /** 新增供应商 */
  async createProvider(dto: CreateProviderDto) {
    const slug = await this.buildUniqueSlug(dto.name);
    const entity = this.providerRepo.create({
      name: dto.name,
      slug,
      baseUrl: dto.baseUrl,
      apiKey: dto.apiKey ? this.encryption.encryptAes(dto.apiKey) : undefined,
      config: dto.config ?? null,
      status: 'active',
      connectionStatus: 'untested',
      isBuiltin: false,
      modelCount: 0,
    });
    const saved = await this.providerRepo.save(entity);
    return this.toProviderItem(saved);
  }

  /** 编辑供应商 */
  async updateProvider(id: number, dto: UpdateProviderDto) {
    const provider = await this.providerRepo.findOne({ where: { id } });
    if (!provider) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '供应商不存在');
    }
    if (dto.name !== undefined && dto.name.trim()) provider.name = dto.name.trim();
    if (dto.baseUrl !== undefined) provider.baseUrl = dto.baseUrl;
    if (dto.apiKey !== undefined && dto.apiKey.trim()) {
      provider.apiKey = this.encryption.encryptAes(dto.apiKey);
    }
    if (dto.config !== undefined) provider.config = dto.config;
    if (dto.status !== undefined) provider.status = dto.status;
    await this.providerRepo.save(provider);
  }

  /** 删除供应商（需先删除其下模型） */
  async removeProvider(id: number) {
    const provider = await this.providerRepo.findOne({ where: { id } });
    if (!provider) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '供应商不存在');
    }
    const modelCount = await this.modelRepo.count({ where: { providerId: id } });
    if (modelCount > 0) {
      BusinessException.throw(
        ErrorCode.VALIDATION_FAILED,
        `该供应商下还有 ${modelCount} 个模型，请先删除或迁移模型后再删除供应商`,
      );
    }
    await this.providerRepo.delete(id);
  }

  /** 测试供应商连接（已保存或未保存均可） */
  async testProvider(dto: TestProviderDto) {
    let provider: ModelProviderEntity | null = null;
    let baseUrl = dto.baseUrl;
    let apiKey = dto.apiKey;
    if (dto.providerId) {
      provider = await this.providerRepo.findOne({ where: { id: dto.providerId } });
      if (!provider) {
        BusinessException.throw(ErrorCode.NOT_FOUND, '供应商不存在');
      }
      baseUrl = provider.baseUrl;
      apiKey = provider.apiKey ? this.encryption.decryptAes(provider.apiKey) : '';
    }
    if (!baseUrl || !apiKey) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '请填写 Base URL 和 API Key');
    }
    try {
      const model = dto.model || 'gpt-3.5-turbo';
      const response = await this.callModelApi(baseUrl, apiKey, model, 'ping');
      if (provider) {
        provider.connectionStatus = 'connected';
        provider.lastTestedAt = new Date();
        await this.providerRepo.save(provider);
      }
      return { success: true, providerId: provider?.id ?? null, response };
    } catch (err: any) {
      if (provider) {
        provider.connectionStatus = 'failed';
        provider.lastTestedAt = new Date();
        await this.providerRepo.save(provider);
      }
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, `连接失败: ${err?.message || err}`);
    }
  }

  /** 读取供应商上游模型列表 */
  async fetchProviderModels(providerId: number) {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '供应商不存在');
    }
    if (!provider.apiKey) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '供应商未配置 API Key，请先编辑保存');
    }
    const apiKey = this.encryption.decryptAes(provider.apiKey);
    const response = await this.fetchModelList(provider.baseUrl, apiKey, provider.config);
    const upstreamModels = parseUpstreamModels(response);
    // 已存在标记：按 upstream_model_id 或 model_id 匹配
    const ids = upstreamModels.map((m) => m.modelId);
    const existing = ids.length
      ? await this.modelRepo
          .createQueryBuilder('m')
          .select(['m.id'])
          .where('(m.upstream_model_id IN (:...ids)) OR (m.model_id IN (:...ids))', { ids })
          .getMany()
      : [];
    const existingIds = new Set<string>();
    for (const e of existing) {
      if (e.upstreamModelId) existingIds.add(e.upstreamModelId);
      existingIds.add(e.modelId);
    }
    return {
      provider: this.toProviderItem(provider),
      models: upstreamModels.map((m) => ({
        ...m,
        alreadyExists: existingIds.has(m.modelId),
      })),
    };
  }

  /** 勾选导入：逐模型定价 + 确定模型类型 */
  async importProviderModels(providerId: number, dto: ImportProviderModelsDto) {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '供应商不存在');
    }
    const existingRows = await this.modelRepo.find({ select: ['modelId'] });
    const existingIds = new Set(existingRows.map((r) => r.modelId));
    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ modelId: string; error: string }> = [];

    for (const item of dto.models) {
      const upstreamModelId = item.upstreamModelId.trim();
      if (!upstreamModelId) {
        errors.push({ modelId: item.upstreamModelId || '(空)', error: '模型 ID 为空' });
        continue;
      }
      // 同一批次内重复跳过
      if (imported.includes(upstreamModelId)) {
        skipped.push(upstreamModelId);
        continue;
      }
      try {
        const modelId = buildUniqueModelId(upstreamModelId, provider.slug, existingIds);
        existingIds.add(modelId);
        const entity = this.modelRepo.create({
          provider: provider.slug,
          providerId: provider.id,
          upstreamModelId,
          modelType: item.modelType || 'chat',
          modelId,
          name: item.displayName?.trim() || upstreamModelId,
          pricePer1kInput: item.inputPricePer1k ?? 0,
          pricePer1kOutput: item.outputPricePer1k ?? 0,
          isActive: item.enabled ?? true,
          connectionStatus: 'untested',
          supportsVision: item.capabilities?.includes('vision') ?? false,
          supportsFunctions: item.capabilities?.includes('function_calling') ?? false,
          minUserLevel: 1,
        });
        await this.modelRepo.save(entity);
        imported.push(upstreamModelId);
      } catch (err: any) {
        errors.push({ modelId: upstreamModelId, error: err?.message || String(err) });
      }
    }

    await this.refreshProviderModelCount(providerId);
    return { imported: imported.length, skipped: skipped.length, errors };
  }

  // ============ 旧中转站接口（兼容桌面端旧页面） ============

  /** 拉取上游模型列表（旧接口：直接传 endpoint+key） */
  async fetchUpstreamModels(dto: FetchModelsDto) {
    const response = await this.fetchModelList(dto.apiEndpoint, dto.apiKey, undefined);
    const upstreamModels = parseUpstreamModels(response);
    const ids = upstreamModels.map((m) => m.modelId);
    const existing = ids.length
      ? await this.modelRepo.find({ select: ['modelId'], where: { modelId: In(ids) } })
      : [];
    const existingIds = new Set(existing.map((e) => e.modelId));
    return {
      models: upstreamModels.map((m) => ({
        ...m,
        alreadyExists: existingIds.has(m.modelId),
      })),
    };
  }

  /** 批量导入模型（旧接口） */
  async importModels(dto: ImportModelsDto) {
    const apiKeyEncrypted = this.encryption.encryptAes(dto.apiKey);
    const imported: string[] = [];
    const skipped: string[] = [];
    const errors: Array<{ modelId: string; error: string }> = [];

    for (const item of dto.models) {
      try {
        const exists = await this.modelRepo.findOne({
          where: { modelId: item.modelId },
        });
        if (exists) {
          skipped.push(item.modelId);
          continue;
        }
        if (
          dto.pricingMode === 'multiplier' &&
          (item.upstreamInputPrice == null || item.upstreamOutputPrice == null)
        ) {
          errors.push({ modelId: item.modelId, error: '上游未返回该模型价格，倍率模式无法计算，请改用固定价(flat)模式或手动填写价格' });
          continue;
        }
        const inputPrice = this.calcPrice(item.upstreamInputPrice ?? 0, 'input', dto);
        const outputPrice = this.calcPrice(item.upstreamOutputPrice ?? 0, 'output', dto);

        const entity = this.modelRepo.create({
          provider: this.guessProvider(dto.apiEndpoint),
          modelId: item.modelId,
          upstreamModelId: item.modelId,
          modelType: 'chat',
          name: item.modelId,
          apiEndpoint: dto.apiEndpoint,
          apiKey: apiKeyEncrypted,
          connectionStatus: 'untested',
          pricePer1kInput: inputPrice,
          pricePer1kOutput: outputPrice,
          isActive: false,
        });
        await this.modelRepo.save(entity);
        imported.push(item.modelId);
      } catch (err: any) {
        errors.push({ modelId: item.modelId, error: err?.message || String(err) });
      }
    }

    return { imported: imported.length, skipped: skipped.length, errors };
  }

  // ============ 私有辅助 ============

  /** 将 DTO 应用到新建实体 */
  private applyCreateDto(entity: ModelEntity, dto: CreateModelDto) {
    entity.provider = dto.provider;
    entity.modelId = dto.modelId;
    entity.upstreamModelId = dto.upstreamModelId || dto.modelId;
    entity.modelType = dto.modelType || 'chat';
    entity.name = dto.displayName;
    entity.pricePer1kInput = dto.inputPricePerToken ?? 0;
    entity.pricePer1kOutput = dto.outputPricePerToken ?? 0;
    entity.isActive = dto.enabled;
    entity.supportsVision = dto.capabilities?.includes('vision') ?? false;
    entity.supportsFunctions = dto.capabilities?.includes('function_calling') ?? false;
    if (dto.providerId) entity.providerId = dto.providerId;
    if (dto.apiKey) entity.apiKey = this.encryption.encryptAes(dto.apiKey);
    if (dto.apiEndpoint) entity.apiEndpoint = dto.apiEndpoint;
  }

  /** 将 DTO 应用到已有实体（仅更新传入字段） */
  private applyUpdateDto(entity: ModelEntity, dto: UpdateModelDto) {
    if (dto.provider !== undefined) entity.provider = dto.provider;
    if (dto.modelId !== undefined) entity.modelId = dto.modelId;
    if (dto.upstreamModelId !== undefined) entity.upstreamModelId = dto.upstreamModelId;
    if (dto.modelType !== undefined) entity.modelType = dto.modelType;
    if (dto.pricePerImage !== undefined) entity.pricePerImage = dto.pricePerImage;
    if (dto.videoPrices !== undefined) entity.videoPrices = dto.videoPrices ?? null;
    if (dto.generationParams !== undefined) entity.generationParams = dto.generationParams ?? null;
    if (dto.displayName !== undefined) entity.name = dto.displayName;
    if (dto.inputPricePerToken !== undefined) entity.pricePer1kInput = dto.inputPricePerToken;
    if (dto.outputPricePerToken !== undefined) entity.pricePer1kOutput = dto.outputPricePerToken;
    if (dto.enabled !== undefined) entity.isActive = dto.enabled;
    if (dto.capabilities !== undefined) {
      entity.supportsVision = dto.capabilities.includes('vision');
      entity.supportsFunctions = dto.capabilities.includes('function_calling');
    }
    if (dto.apiKey) entity.apiKey = this.encryption.encryptAes(dto.apiKey);
    if (dto.apiEndpoint !== undefined) entity.apiEndpoint = dto.apiEndpoint;
    if (dto.minUserLevel !== undefined) entity.minUserLevel = dto.minUserLevel;
  }

  /** 实体 -> 管理端契约视图对象 */
  private toAdminModelItem(m: ModelEntity, provider?: ModelProviderEntity | null) {
    const capabilities: string[] = [];
    if (m.supportsVision) capabilities.push('vision');
    if (m.supportsFunctions) capabilities.push('function_calling');

    return {
      id: m.id,
      providerId: m.providerId ?? null,
      provider: m.provider,
      providerName: provider?.name ?? m.provider,
      modelId: m.modelId,
      upstreamModelId: m.upstreamModelId ?? m.modelId,
      modelType: m.modelType || 'chat',
      pricePerImage: m.pricePerImage ?? null,
      videoPrices: m.videoPrices ?? {},
      generationParams: m.generationParams ?? {},
      displayName: m.name,
      apiKeyMasked: m.apiKey ? this.encryption.maskKey(m.apiKey) : undefined,
      apiEndpoint: m.apiEndpoint,
      connectionStatus: m.connectionStatus || 'untested',
      lastTestedAt: m.lastTestedAt,
      inputPricePerToken: m.pricePer1kInput ?? 0,
      outputPricePerToken: m.pricePer1kOutput ?? 0,
      minUserLevel: m.minUserLevel ?? 1,
      enabled: m.isActive,
      syncStatus: 'synced' as const,
      syncErrorMessage: undefined,
      capabilities,
      concurrencyLimit: undefined,
      rateLimitPerMinute: undefined,
      lastSyncedAt: undefined,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  /** 供应商实体 -> 视图对象 */
  private toProviderItem(p: ModelProviderEntity) {
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      baseUrl: p.baseUrl,
      apiKeyMasked: p.apiKey ? this.encryption.maskKey(p.apiKey) : undefined,
      hasApiKey: Boolean(p.apiKey),
      config: p.config ?? null,
      status: p.status,
      connectionStatus: p.connectionStatus || 'untested',
      lastTestedAt: p.lastTestedAt,
      isBuiltin: p.isBuiltin,
      modelCount: p.modelCount ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  /** 批量加载供应商名称映射（避免 N+1） */
  private async loadProviderNameMap(models: ModelEntity[]): Promise<Map<number, ModelProviderEntity>> {
    const ids = [...new Set(models.map((m) => m.providerId).filter((v): v is number => Boolean(v)))];
    if (!ids.length) return new Map();
    const providers = await this.providerRepo.find({ where: { id: In(ids) } });
    return new Map(providers.map((p) => [p.id, p]));
  }

  /** 生成唯一 slug */
  private async buildUniqueSlug(name: string): Promise<string> {
    const base = buildSlug(name);
    const existing = await this.providerRepo.find({ select: ['slug'] });
    const used = new Set(existing.map((p) => p.slug));
    if (!used.has(base)) return base;
    let n = 2;
    while (n < 100000) {
      const candidate = `${base}-${n}`;
      if (!used.has(candidate)) return candidate;
      n++;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  /** 刷新供应商 model_count */
  private async refreshProviderModelCount(providerId?: number | null) {
    if (!providerId) return;
    const count = await this.modelRepo.count({ where: { providerId } });
    await this.providerRepo.update(providerId, { modelCount: count });
  }

  // ============ 内部辅助 ============

  /** 猜测 provider（旧接口） */
  private guessProvider(endpoint: string): string {
    const u = endpoint.toLowerCase();
    if (u.includes('openai')) return 'openai';
    if (u.includes('doubao') || u.includes('volces')) return 'doubao';
    if (u.includes('dashscope') || u.includes('tongyi')) return 'qwen';
    if (u.includes('deepseek')) return 'deepseek';
    return 'other';
  }

  /** 按加价模式计算积分价格（旧接口） */
  private calcPrice(upstreamPrice: number, type: 'input' | 'output', dto: ImportModelsDto): number {
    // 上游价格是元/千token，积分按 1元=100积分
    if (dto.pricingMode === 'multiplier') {
      const m = dto.multiplier ?? 1;
      return parseFloat((upstreamPrice * m * 100).toFixed(4));
    }
    if (dto.pricingMode === 'fixed') {
      const add = type === 'input' ? (dto.fixedInputAdd ?? 0) : (dto.fixedOutputAdd ?? 0);
      return parseFloat((upstreamPrice * 100 + add).toFixed(4));
    }
    return type === 'input' ? (dto.flatInputPrice ?? 0) : (dto.flatOutputPrice ?? 0);
  }

  /** 调用模型 API 发起 chat/completions 测试请求 */
  private async callModelApi(endpoint: string, apiKey: string, modelId: string, input: string): Promise<string> {
    const url = this.normalizeEndpoint(endpoint) + '/chat/completions';
    const body = JSON.stringify({
      model: modelId,
      messages: [{ role: 'user', content: input || 'Hello' }],
      max_tokens: 50,
    });
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || JSON.stringify(data);
  }

  /** 拉取模型列表 (GET /models) */
  private async fetchModelList(endpoint: string, apiKey: string, config?: Record<string, unknown> | null): Promise<any> {
    const base = this.normalizeEndpoint(endpoint);
    const modelsPath = (config?.modelsPath as string) || '/models';
    const url = modelsPath.startsWith('http') ? modelsPath : base + modelsPath;
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    if (config?.headers && typeof config.headers === 'object') {
      Object.assign(headers, config.headers as Record<string, string>);
    }
    const resp = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    return resp.json();
  }

  /** 保证端点以 /v1 结尾 */
  private normalizeEndpoint(endpoint: string): string {
    return endpoint.replace(/\/v1\/?$/, '').replace(/\/+$/, '') + '/v1';
  }
}

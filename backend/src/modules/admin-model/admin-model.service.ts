import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, QueryDeepPartialEntity, Repository } from 'typeorm';
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
  BatchEnableDto,
  BatchPriceDto,
  CreateFromTemplateDto,
  ImportModelsJsonDto,
} from './dto/batch-model.dto';
import {
  buildSlug,
  buildUniqueModelId,
  parseUpstreamModels,
} from './utils/provider-utils';
import {
  callModeFromModelType,
  deriveModelType,
  inputTypesFromModelType,
  normalizeAdvancedCapabilities,
  normalizeInputTypes,
  outputTypeFromModelType,
} from './utils/model-type-utils';
import { shouldAlertBalance } from './utils/balance-utils';
import { CALL_MODES, CALL_MODE_TO_MODEL_TYPE, SCENARIO_TAGS } from './constants/call-modes';
import { SPEC_FIELD_SCHEMAS, ADVANCED_CAP_LABELS } from './constants/form-meta';
import { MODEL_TEMPLATES, PROVIDER_TEMPLATES } from './constants/model-templates';
import { MarketImportDto } from './dto/market-import.dto';
import {
  marketPresetsForVendor,
  resolvePricing,
} from './utils/market-utils';
import { presetsForProviderType } from './utils/provider-type-utils';
import { GenerationClientService, GenerationAdapterConfig, mergeGenerationAdapter, buildMediaGenerationAdapter } from '../media-generation/generation-client.service';

/** 模型查询参数 */
interface ModelQuery {
  provider?: string;
  enabled?: boolean | string;
  keyword?: string;
  modelType?: string;
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
export class AdminModelService implements OnModuleInit {
  constructor(
    @InjectRepository(ModelEntity)
    private modelRepo: Repository<ModelEntity>,
    @InjectRepository(ModelProviderEntity)
    private providerRepo: Repository<ModelProviderEntity>,
    private encryption: EncryptionService,
    private generationClient: GenerationClientService,
  ) {}

  private readonly logger = new Logger(AdminModelService.name);

  private balancePollTimer?: NodeJS.Timeout;

  async onModuleInit(): Promise<void> {
    if (this.balancePollTimer) return;
    this.balancePollTimer = this.startBalancePolling();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.balancePollTimer) {
      clearInterval(this.balancePollTimer);
      this.balancePollTimer = undefined;
    }
  }

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
    if (query.modelType) {
      qb.andWhere('m.model_type = :mt', { mt: String(query.modelType) });
    }

    qb.orderBy('m.sort_order', 'ASC').addOrderBy('m.created_at', 'DESC')
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
    const modelId = dto.modelId?.trim() || dto.upstreamModelId?.trim() || '';
    await this.assertModelIdAvailable(modelId, dto.upstreamModelId);
    const entity = new ModelEntity();
    this.applyCreateDto(entity, dto);
    const saved = await this.saveModelOrDuplicate(entity, modelId);
    await this.refreshProviderModelCount(saved.providerId);
    return this.toAdminModelItem(saved);
  }

  /** 重复添加保护：model_id 唯一索引冲突时给明确业务提示，而不是 500 */
  private async assertModelIdAvailable(modelId: string, upstreamModelId?: string) {
    if (!modelId) return;
    const where: Array<{ modelId: string } | { upstreamModelId: string }> = [{ modelId }];
    if (upstreamModelId && upstreamModelId !== modelId) {
      where.push({ upstreamModelId });
    }
    const dup = await this.modelRepo.findOne({ where });
    if (dup) {
      BusinessException.throw(
        ErrorCode.VALIDATION_FAILED,
        `模型已存在: ${modelId}（可在模型列表直接编辑；如需重新添加请先删除旧记录）`,
      );
    }
  }

  /** 落库并捕获唯一索引冲突（并发的兜底） */
  private async saveModelOrDuplicate(entity: ModelEntity, modelId: string): Promise<ModelEntity> {
    try {
      return await this.modelRepo.save(entity);
    } catch (err: any) {
      const errno = err?.driverError?.errno ?? err?.errno;
      if (errno === 1062 || err?.code === 'ER_DUP_ENTRY') {
        BusinessException.throw(
          ErrorCode.VALIDATION_FAILED,
          `模型已存在: ${modelId}（可在模型列表直接编辑；如需重新添加请先删除旧记录）`,
        );
      }
      throw err;
    }
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
    const callMode = model.callMode || callModeFromModelType(model.modelType);
    const def = CALL_MODES.find((m) => m.key === callMode);
    if (!def) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, `未知调用模式: ${callMode}`);
    }
    if (callMode === 'realtime') {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '该模式暂不支持测试');
    }
    if (!apiKey || !endpoint) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '模型未关联供应商凭据，无法测试');
    }
    const cfg = (provider?.config ?? {}) as Record<string, unknown>;
    const chatPath = typeof cfg.chatPath === 'string' && cfg.chatPath.trim() ? cfg.chatPath.trim() : '';
    const useChatPath = !!chatPath && (callMode === 'text_chat' || callMode === 'vision' || callMode === 'ocr');
    const apiPath = useChatPath ? chatPath : def.apiPath;
    try {
      let response: string | Record<string, unknown>;
      if (callMode === 'video' || callMode === 'video_edit') {
        const adapter = buildMediaGenerationAdapter(provider, model.generationParams);
        const { taskId } = await this.generationClient.submitVideo({
          endpoint,
          apiKey,
          adapter,
          model: upstreamModelId,
          prompt: dto.input,
          duration: 5,
        });
        response = { taskId, message: `视频任务已提交（异步），taskId=${taskId}` };
      } else if (callMode === 'image' || callMode === 'image_edit') {
        const adapter = buildMediaGenerationAdapter(provider, model.generationParams);
        if (callMode === 'image_edit' && !(dto.inputImages && dto.inputImages.length)) {
          BusinessException.throw(
            ErrorCode.VALIDATION_FAILED,
            '图像编辑模型测试需要一张参考图（图生图需公网 base_image_url）：请传入参考图 URL 后重试，或到桌面端上传图片后测试',
          );
        }
        for (const u of dto.inputImages ?? []) {
          if (!/^https?:\/\//i.test(u)) {
            BusinessException.throw(
              ErrorCode.VALIDATION_FAILED,
              '测试参考图仅支持 http(s) 公网图片 URL',
            );
          }
        }
        if (adapter.imagesPath || adapter.requestTemplate) {
          // 配置了生成适配（如 DashScope 原生图片端点）→ 走与运行时一致的 generateImage
          const result = await this.generationClient.generateImage({
            endpoint,
            apiKey,
            adapter,
            model: upstreamModelId,
            prompt: dto.input,
            size: '1024x1024',
            inputImages: dto.inputImages ?? [],
          });
          response = JSON.stringify(result);
        } else {
          const body = this.buildTestBody(callMode, upstreamModelId, dto.input);
          const out = await this.callUpstreamRaw(
            this.buildApiUrl(endpoint, apiPath),
            apiKey,
            body,
          );
          response = this.formatTestOutput(callMode, out);
        }
      } else {
        const body = this.buildTestBody(callMode, upstreamModelId, dto.input);
        const out = await this.callUpstreamRaw(
          this.buildApiUrl(endpoint, apiPath),
          apiKey,
          body,
        );
        response = this.formatTestOutput(callMode, out);
      }
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

  /** 动态表单元数据（14 种模式 + 规格字段 schema + 高级能力标签 + 场景标签） */
  async callModesMeta() {
    return {
      callModes: CALL_MODES,
      specFieldSchemas: SPEC_FIELD_SCHEMAS,
      advancedCapLabels: ADVANCED_CAP_LABELS,
      scenarioTags: SCENARIO_TAGS,
    };
  }

  /** 模板库列表 */
  async templateList() {
    return MODEL_TEMPLATES;
  }

  /** 模型市场：厂商列表 + 是否已创建该厂商供应商（config.vendorKey 关联） */
  async marketVendors() {
    const providers = await this.providerRepo.find();
    return PROVIDER_TEMPLATES.map((pt) => {
      const provider = providers.find(
        (p) =>
          (p.config as { vendorKey?: string } | null)?.vendorKey === pt.vendor,
      );
      return {
        vendor: pt.vendor,
        nameSuggestion: pt.nameSuggestion,
        baseUrl: pt.baseUrl,
        chatPath: pt.chatPath,
        modelsPath: pt.modelsPath,
        apiStyle: pt.apiStyle,
        generation: pt.generation,
        hasProvider: Boolean(provider),
        providerId: provider?.id ?? null,
        presetCount: MODEL_TEMPLATES.filter((t) => t.vendor === pt.vendor).length,
      };
    });
  }

  /** 模型市场：某厂商预设列表（relay 返回空数组；type=image/video 时按类型过滤，供供应商导入弹窗按类型读取预设） */
  async marketPresets(vendor: string, type?: string) {
    if (!PROVIDER_TEMPLATES.some((p) => p.vendor === vendor)) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `未知厂商: ${vendor}`);
    }
    const templates =
      type === 'image' || type === 'video'
        ? presetsForProviderType(marketPresetsForVendor(vendor), type, CALL_MODES)
        : marketPresetsForVendor(vendor);
    return templates.map((t) => ({
      key: t.key,
      vendor: t.vendor,
      name: t.name,
      callMode: t.callMode,
      description: t.description,
      upstreamModelId: t.upstreamModelId,
      specValues: t.specValues,
      generationParams: t.generationParams,
      recommendedScenarioTags: t.recommendedScenarioTags,
      referencePrice: t.referencePrice,
      verified: t.verified,
      requiresActivation: t.requiresActivation,
    }));
  }

  /** 模型市场：批量创建（逐项复用 createFromTemplate，单项失败不中断） */
  async marketImport(dto: MarketImportDto) {
    const provider = await this.providerRepo.findOne({ where: { id: dto.providerId } });
    if (!provider) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '供应商不存在');
    }
    // 已存在检测：按预设模板 key 对应 modelId 判定，重复导入给明确提示而非 Duplicate 报错
    const existingRows = await this.modelRepo.find({ select: ['modelId', 'upstreamModelId'] });
    const existingIds = new Set<string>();
    for (const r of existingRows) {
      if (r.modelId) existingIds.add(r.modelId);
      if (r.upstreamModelId) existingIds.add(r.upstreamModelId);
    }
    const results: Array<{ presetKey: string; ok: boolean; modelId?: string; error?: string }> = [];
    for (const item of dto.items) {
      const tpl = MODEL_TEMPLATES.find((t) => t.key === item.presetKey);
      const dupKey = tpl?.key;
      if (dupKey && existingIds.has(dupKey)) {
        results.push({ presetKey: item.presetKey, ok: false, error: '该预设已存在（可在模型列表编辑），无需重复导入' });
        continue;
      }
      try {
        const created = await this.createFromTemplate({
          templateKey: item.presetKey,
          providerId: dto.providerId,
          displayName: item.displayName,
          enabled: item.enabled ?? false,
          scenarioTags: item.scenarioTags,
          priceOverrides: item.priceOverrides,
        });
        if (created.modelId) existingIds.add(created.modelId);
        if (created.upstreamModelId) existingIds.add(created.upstreamModelId);
        results.push({ presetKey: item.presetKey, ok: true, modelId: created.modelId });
      } catch (err: any) {
        results.push({ presetKey: item.presetKey, ok: false, error: err?.message || String(err) });
      }
    }
    return {
      imported: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  /** 从模板创建模型（默认下架；模型市场批量导入复用本方法） */
  async createFromTemplate(dto: CreateFromTemplateDto) {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === dto.templateKey);
    if (!tpl) {
      BusinessException.throw(ErrorCode.NOT_FOUND, `模板不存在: ${dto.templateKey}`);
    }
    const def = CALL_MODES.find((m) => m.key === tpl.callMode);
    if (!def) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, `模板调用模式非法: ${tpl.callMode}`);
    }
    const entity = new ModelEntity();
    entity.provider = dto.providerId ? '' : 'global';
    entity.modelId = dto.modelId || tpl.key;
    entity.upstreamModelId = dto.modelId || tpl.upstreamModelId;
    entity.name = dto.displayName || tpl.name;
    entity.callMode = tpl.callMode;
    entity.modelType = CALL_MODE_TO_MODEL_TYPE[tpl.callMode];
    entity.inputTypes = def.inputs;
    entity.advancedCapabilities = normalizeAdvancedCapabilities(def.advancedCaps);
    entity.supportsVision = def.inputs.includes('image');
    entity.supportsFunctions = (entity.advancedCapabilities || []).includes('function_calling');
    entity.specs = tpl.specValues ? structuredClone(tpl.specValues) : null;
    entity.generationParams = tpl.generationParams ? structuredClone(tpl.generationParams) : null;
    entity.scenarioTags = dto.scenarioTags
      ? structuredClone(dto.scenarioTags)
      : tpl.recommendedScenarioTags
        ? structuredClone(tpl.recommendedScenarioTags)
        : [];
    entity.pricingMode = def.recommendedBilling;
    const pricing = resolvePricing(tpl, dto.priceOverrides);
    entity.pricePer1kInput = pricing.pricePer1kInput ?? 0;
    entity.pricePer1kOutput = pricing.pricePer1kOutput ?? 0;
    entity.pricePerImage = pricing.pricePerImage ?? undefined;
    entity.pricePerCall = pricing.pricePerCall ?? undefined;
    entity.pricePerMinute = pricing.pricePerMinute ?? undefined;
    entity.videoPerSecond = pricing.videoPerSecond
      ? structuredClone(pricing.videoPerSecond)
      : null;
    entity.isActive = dto.enabled ?? false;
    if (dto.providerId) entity.providerId = dto.providerId;
    await this.assertModelIdAvailable(entity.modelId, entity.upstreamModelId);
    const saved = await this.saveModelOrDuplicate(entity, entity.modelId);
    await this.refreshProviderModelCount(saved.providerId);
    return this.toAdminModelItem(saved);
  }

  // ============ 批量操作 ============

  /** 批量上架/下架 */
  async batchEnable(dto: BatchEnableDto) {
    if (dto.ids.length === 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '请至少选择一个模型');
    }
    const result = await this.modelRepo.update({ id: In(dto.ids) }, { isActive: dto.enabled });
    return { updated: result.affected ?? dto.ids.length };
  }

  /** 批量改价（仅更新传入字段；不传或传 null 的字段保持不变） */
  async batchUpdatePrice(dto: BatchPriceDto) {
    if (dto.ids.length === 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '请至少选择一个模型');
    }
    const patch: QueryDeepPartialEntity<ModelEntity> = {};
    if (dto.pricePerCall != null) patch.pricePerCall = Number(dto.pricePerCall);
    if (dto.pricePerImage != null) patch.pricePerImage = Number(dto.pricePerImage);
    if (dto.pricePerMinute != null) patch.pricePerMinute = Number(dto.pricePerMinute);
    if (dto.videoPerSecond != null) patch.videoPerSecond = dto.videoPerSecond;
    if (dto.inputPricePerToken != null) patch.pricePer1kInput = Number(dto.inputPricePerToken);
    if (dto.outputPricePerToken != null) patch.pricePer1kOutput = Number(dto.outputPricePerToken);
    if (Object.keys(patch).length === 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '至少提供一个价格字段');
    }
    const result = await this.modelRepo.update({ id: In(dto.ids) }, patch);
    return { updated: result.affected ?? dto.ids.length };
  }

  /** 导出配置 JSON（当前筛选条件下全部模型的管理端视图） */
  async exportModels(query: ModelQuery) {
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
        kw: '%' + query.keyword + '%',
      });
    }
    if (query.modelType) {
      qb.andWhere('m.model_type = :mt', { mt: String(query.modelType) });
    }
    qb.orderBy('m.sort_order', 'ASC').addOrderBy('m.created_at', 'DESC');
    const items = await qb.getMany();
    const providerMap = await this.loadProviderNameMap(items);
    return items.map((m) => this.toAdminModelItem(m, providerMap.get(m.providerId ?? -1)));
  }

  /** 批量导入配置 JSON（字段与 CreateModelDto 一致；同 modelId 已存在则合并更新，否则新建） */
  async importModelsJson(dto: ImportModelsJsonDto) {
    if (!Array.isArray(dto.items) || dto.items.length === 0) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '导入项不能为空');
    }
    let imported = 0;
    let updated = 0;
    const errors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      try {
        if (!item || typeof item !== 'object') {
          throw new Error('导入项格式非法');
        }
        const createDto = Object.assign(new CreateModelDto(), item);
        if (!createDto.modelId || !createDto.displayName || !createDto.provider) {
          throw new Error('导入项缺少 modelId/displayName/provider');
        }
        createDto.capabilities = createDto.capabilities ?? [];
        createDto.enabled = createDto.enabled ?? false;
        createDto.minUserLevel = createDto.minUserLevel ?? 0;
        const exists = await this.modelRepo.findOne({ where: { modelId: createDto.modelId } });
        if (exists) {
          const updateDto = Object.assign(new UpdateModelDto(), item);
          this.applyUpdateDto(exists, updateDto);
          if (item.videoPrices !== undefined) {
            exists.videoPrices = item.videoPrices as Record<string, Record<string, number>>;
          }
          const saved = await this.modelRepo.save(exists);
          await this.refreshProviderModelCount(saved.providerId);
          updated++;
        } else {
          const entity = new ModelEntity();
          this.applyCreateDto(entity, createDto);
          if (item.videoPrices !== undefined) {
            entity.videoPrices = item.videoPrices as Record<string, Record<string, number>>;
          }
          const saved = await this.modelRepo.save(entity);
          await this.refreshProviderModelCount(saved.providerId);
          imported++;
        }
      } catch (err: any) {
        errors.push({ index: i, error: err?.message || String(err) });
      }
    }
    return { imported, updated, errors };
  }

  // ============ 供应商余额监控 ============

  /** 立即检查供应商余额：POST balance_url（headers/extra 来自供应商配置），余额取值支持嵌套路径 balancePath */
  async checkProviderBalance(providerId: number) {
    const provider = await this.providerRepo.findOne({ where: { id: providerId } });
    if (!provider) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '供应商不存在');
    }
    if (!provider.balanceUrl) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '供应商未配置余额查询接口（balanceUrl）');
    }
    const headers: Record<string, string> = {};
    const rawHeaders = provider.balanceHeaders as Record<string, unknown> | null | undefined;
    if (rawHeaders && typeof rawHeaders === 'object') {
      for (const [k, v] of Object.entries(rawHeaders)) {
        headers[k] = String(v).replace('{{apiKey}}', provider.apiKey ? this.encryption.decryptAes(provider.apiKey) : '');
      }
    }
    const extra = (provider.balanceExtra as Record<string, unknown> | null | undefined) ?? {};
    const balancePath = typeof extra.balancePath === 'string' ? extra.balancePath : 'balance';
    let data: unknown;
    try {
      const resp = await fetch(provider.balanceUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(extra.body ?? {}),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        const text = await resp.text();
        BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, `余额接口错误(${resp.status}): ${text.slice(0, 200)}`);
      }
      data = await resp.json();
    } catch (err: any) {
      if (err instanceof BusinessException) throw err;
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, `余额接口调用失败: ${err?.message || err}`);
    }
    const raw = this.pickByPath(data, balancePath);
    if (raw == null || raw === '') {
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, `余额接口返回无法解析: ${JSON.stringify(data).slice(0, 200)}`);
    }
    const balance = Number(raw);
    if (Number.isNaN(balance)) {
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, `余额接口返回无法解析: ${JSON.stringify(data).slice(0, 200)}`);
    }
    provider.lastBalance = balance;
    provider.balanceCheckedAt = new Date();
    await this.providerRepo.save(provider);
    const threshold = provider.balanceAlertThreshold == null ? null : Number(provider.balanceAlertThreshold);
    const alert = shouldAlertBalance(balance, threshold);
    if (alert) {
      this.logger.warn(`供应商余额不足: provider=${providerId} balance=${balance} threshold=${threshold}`);
    }
    return {
      providerId,
      balance,
      checkedAt: provider.balanceCheckedAt,
      alert,
      threshold,
    };
  }

  /** 嵌套路径取值（如 data.balance / data.account.credit） */
  private pickByPath(obj: unknown, path: string): unknown {
    return String(path)
      .split('.')
      .filter(Boolean)
      .reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }

  /** 定时轮询所有配置了 balanceUrl 的供应商（启动后每 BALANCE_CHECK_INTERVAL_MS 毫秒，默认 10 分钟） */
  private startBalancePolling(): NodeJS.Timeout {
    const intervalMs = Math.max(Number(process.env.BALANCE_CHECK_INTERVAL_MS) || 600000, 1000);
    const timer = setInterval(async () => {
      try {
        const providers = await this.providerRepo.find({
          where: { balanceUrl: Not('') },
        });
        for (const p of providers) {
          if (!p.balanceUrl) continue;
          try {
            await this.checkProviderBalance(p.id);
          } catch (e) {
            this.logger.warn(`供应商余额检查失败 #${p.id}: ${(e as Error).message}`);
          }
        }
      } catch (e) {
        this.logger.warn(`余额轮询失败: ${(e as Error).message}`);
      }
    }, intervalMs);
    timer.unref();
    return timer;
  }

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
      isGlobal: dto.isGlobal ?? false,
      apiStyle: dto.apiStyle,
      rateLimitPerMinute: dto.rateLimitPerMinute,
      concurrencyLimit: dto.concurrencyLimit,
      balanceUrl: dto.balanceUrl,
      balanceHeaders: dto.balanceHeaders ?? null,
      balanceExtra: dto.balanceExtra ?? null,
      balanceAlertThreshold: dto.balanceAlertThreshold,
      modelCount: 0,
    });
    const saved = await this.providerRepo.save(entity);
    if (dto.isGlobal) {
      await this.clearOtherGlobal(saved.id);
    }
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
    if (dto.isGlobal !== undefined) provider.isGlobal = dto.isGlobal;
    if (dto.apiStyle !== undefined) provider.apiStyle = dto.apiStyle;
    if (dto.rateLimitPerMinute !== undefined) provider.rateLimitPerMinute = dto.rateLimitPerMinute;
    if (dto.concurrencyLimit !== undefined) provider.concurrencyLimit = dto.concurrencyLimit;
    if (dto.balanceUrl !== undefined) provider.balanceUrl = dto.balanceUrl;
    if (dto.balanceHeaders !== undefined) provider.balanceHeaders = dto.balanceHeaders;
    if (dto.balanceExtra !== undefined) provider.balanceExtra = dto.balanceExtra;
    if (dto.balanceAlertThreshold !== undefined) provider.balanceAlertThreshold = dto.balanceAlertThreshold;
    await this.providerRepo.save(provider);
    if (dto.isGlobal) {
      await this.clearOtherGlobal(provider.id);
    }
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
      const model = dto.model?.trim() || 'gpt-3.5-turbo';
      const config: Record<string, unknown> | null = provider?.config ?? dto.config ?? null;
      let response: string;
      try {
        response = await this.callModelApi(baseUrl, apiKey, model, 'ping', config);
      } catch (chatErr: any) {
        // chat 探测失败但连接本身可能有效：
        // 1) 供应商不支持默认测试模型 gpt-3.5-turbo（如 DeepSeek 仅支持 deepseek-*）
        // 2) 端点无 chat 能力（如 DashScope 原生媒体端点，报 No static resource）
        // 此时回退 GET 模型列表验证 URL + Key（config.modelsPath / config.chatPath 可覆盖默认路径）
        if (!this.isChatProbeFallbackable(chatErr)) throw chatErr;
        const list = await this.fetchModelList(baseUrl, apiKey, config ?? undefined);
        const listData = Array.isArray(list) ? list : (list?.data ?? []);
        response = `连接成功（chat 测试模型 ${model} 不受当前端点支持，已通过模型列表验证 ${listData.length} 个模型）`;
      }
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
        const inputTypes = normalizeInputTypes(
          item.inputTypes ||
            (item.capabilities?.includes('vision')
              ? ['text', 'image']
              : inputTypesFromModelType(item.modelType)),
        );
        const advancedCapabilities = normalizeAdvancedCapabilities(
          item.advancedCapabilities ||
            (item.capabilities?.includes('function_calling')
              ? ['function_calling']
              : []),
        );
        const entity = this.modelRepo.create({
          provider: provider.slug,
          providerId: provider.id,
          upstreamModelId,
          modelType:
            item.outputType || item.inputTypes
              ? deriveModelType(item.outputType, inputTypes)
              : item.modelType || 'chat',
          modelId,
          name: item.displayName?.trim() || upstreamModelId,
          pricePer1kInput: item.inputPricePer1k ?? 0,
          pricePer1kOutput: item.outputPricePer1k ?? 0,
          isActive: item.enabled ?? true,
          connectionStatus: 'untested',
          inputTypes,
          advancedCapabilities,
          supportsVision: inputTypes.includes('image'),
          supportsFunctions: advancedCapabilities.includes('function_calling'),
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

  /** 单全局互斥：仅保留指定供应商为全局，其余全部取消 */
  private async clearOtherGlobal(keepId: number) {
    await this.providerRepo
      .createQueryBuilder()
      .update()
      .set({ isGlobal: false })
      .where('is_global = 1 AND id != :id', { id: keepId })
      .execute();
  }

  /** 将 DTO 应用到新建实体 */
  private applyCreateDto(entity: ModelEntity, dto: CreateModelDto) {
    entity.provider = dto.provider;
    entity.modelId = dto.modelId;
    entity.upstreamModelId = dto.upstreamModelId || dto.modelId;
    entity.name = dto.displayName;
    entity.pricePer1kInput = dto.inputPricePerToken ?? 0;
    entity.pricePer1kOutput = dto.outputPricePerToken ?? 0;
    entity.isActive = dto.enabled;
    // 新语义：输出类型 × 输入类型 -> 路由分类；旧接口仍按 modelType + capabilities 兼容
    if (dto.outputType !== undefined || dto.inputTypes !== undefined) {
      const inputTypes = normalizeInputTypes(dto.inputTypes);
      entity.modelType = deriveModelType(dto.outputType, inputTypes);
      entity.inputTypes = inputTypes;
      entity.advancedCapabilities = normalizeAdvancedCapabilities(
        dto.advancedCapabilities,
      );
    } else {
      entity.modelType = dto.modelType || 'chat';
      entity.inputTypes = inputTypesFromModelType(entity.modelType);
      entity.advancedCapabilities = dto.capabilities?.includes('function_calling')
        ? ['function_calling']
        : [];
    }
    entity.supportsVision = (entity.inputTypes || []).includes('image');
    entity.supportsFunctions = (entity.advancedCapabilities || []).includes(
      'function_calling',
    );
    if (dto.providerId) entity.providerId = dto.providerId;
    if (dto.apiKey) entity.apiKey = this.encryption.encryptAes(dto.apiKey);
    if (dto.apiEndpoint) entity.apiEndpoint = dto.apiEndpoint;
    // P2：调用模式总开关 -> 自动归类（modelType/inputTypes/能力）
    if (dto.callMode !== undefined) {
      const def = CALL_MODES.find((m) => m.key === dto.callMode);
      if (!def) {
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, `未知调用模式: ${dto.callMode}`);
      }
      entity.callMode = dto.callMode;
      entity.modelType = CALL_MODE_TO_MODEL_TYPE[def.key];
      entity.inputTypes = def.inputs;
      entity.advancedCapabilities = normalizeAdvancedCapabilities(
        dto.advancedCapabilities ?? def.advancedCaps,
      );
      entity.supportsVision = def.inputs.includes('image');
      entity.supportsFunctions = (entity.advancedCapabilities || []).includes('function_calling');
    }
    if (dto.scenarioTags !== undefined) entity.scenarioTags = dto.scenarioTags;
    if (dto.pricingMode !== undefined) entity.pricingMode = dto.pricingMode;
    if (dto.videoPerSecond !== undefined) entity.videoPerSecond = dto.videoPerSecond ?? null;
    if (dto.specs !== undefined) entity.specs = dto.specs ?? null;
    if (dto.iconUrl !== undefined) entity.iconUrl = dto.iconUrl;
    if (dto.costPrice !== undefined) entity.costPrice = Number(dto.costPrice);
    if (dto.remark !== undefined) entity.remark = dto.remark;
    if (dto.pricePerMinute !== undefined) entity.pricePerMinute = Number(dto.pricePerMinute);
  }

  /** 将 DTO 应用到已有实体（仅更新传入字段） */
  private applyUpdateDto(entity: ModelEntity, dto: UpdateModelDto) {
    if (dto.provider !== undefined) entity.provider = dto.provider;
    if (dto.modelId !== undefined) entity.modelId = dto.modelId;
    if (dto.upstreamModelId !== undefined) entity.upstreamModelId = dto.upstreamModelId;
    if (dto.pricePerImage !== undefined) entity.pricePerImage = dto.pricePerImage;
    if (dto.videoPrices !== undefined) entity.videoPrices = dto.videoPrices ?? null;
    if (dto.generationParams !== undefined) entity.generationParams = dto.generationParams ?? null;
    if (dto.sortOrder !== undefined) entity.sortOrder = dto.sortOrder;
    if (dto.pricePerCall !== undefined) entity.pricePerCall = dto.pricePerCall;
    if (dto.displayName !== undefined) entity.name = dto.displayName;
    if (dto.inputPricePerToken !== undefined) entity.pricePer1kInput = dto.inputPricePerToken;
    if (dto.outputPricePerToken !== undefined) entity.pricePer1kOutput = dto.outputPricePerToken;
    if (dto.enabled !== undefined) entity.isActive = dto.enabled;
    // 新语义：输出类型 × 输入类型 -> 路由分类（优先于旧的 modelType）
    if (dto.outputType !== undefined || dto.inputTypes !== undefined) {
      const inputTypes = normalizeInputTypes(dto.inputTypes);
      entity.modelType = deriveModelType(dto.outputType, inputTypes);
      entity.inputTypes = inputTypes;
      entity.supportsVision = inputTypes.includes('image');
    }
    if (dto.advancedCapabilities !== undefined) {
      entity.advancedCapabilities = normalizeAdvancedCapabilities(
        dto.advancedCapabilities,
      );
      entity.supportsFunctions = (entity.advancedCapabilities || []).includes(
        'function_calling',
      );
    }
    // 旧接口兼容：仅传 modelType / capabilities 时按旧语义处理
    if (
      dto.modelType !== undefined &&
      dto.outputType === undefined &&
      dto.inputTypes === undefined
    ) {
      entity.modelType = dto.modelType;
      entity.inputTypes = inputTypesFromModelType(dto.modelType);
    }
    if (
      dto.capabilities !== undefined &&
      dto.outputType === undefined &&
      dto.inputTypes === undefined
    ) {
      entity.supportsVision = dto.capabilities.includes('vision');
      entity.supportsFunctions = dto.capabilities.includes('function_calling');
    }
    if (dto.apiKey) entity.apiKey = this.encryption.encryptAes(dto.apiKey);
    if (dto.apiEndpoint !== undefined) entity.apiEndpoint = dto.apiEndpoint;
    if (dto.minUserLevel !== undefined) entity.minUserLevel = dto.minUserLevel;
    // P2：调用模式切换 -> 重新自动归类（未显式传能力时按新模式默认能力）
    if (dto.callMode !== undefined) {
      const def = CALL_MODES.find((m) => m.key === dto.callMode);
      if (!def) {
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, `未知调用模式: ${dto.callMode}`);
      }
      entity.callMode = dto.callMode;
      entity.modelType = CALL_MODE_TO_MODEL_TYPE[def.key];
      entity.inputTypes = def.inputs;
      entity.supportsVision = def.inputs.includes('image');
      if (dto.advancedCapabilities === undefined) {
        entity.advancedCapabilities = normalizeAdvancedCapabilities(def.advancedCaps);
        entity.supportsFunctions = (entity.advancedCapabilities || []).includes('function_calling');
      }
    }
    if (dto.scenarioTags !== undefined) entity.scenarioTags = dto.scenarioTags;
    if (dto.pricingMode !== undefined) entity.pricingMode = dto.pricingMode;
    if (dto.videoPerSecond !== undefined) entity.videoPerSecond = dto.videoPerSecond ?? null;
    if (dto.specs !== undefined) entity.specs = dto.specs ?? null;
    if (dto.iconUrl !== undefined) entity.iconUrl = dto.iconUrl;
    if (dto.costPrice !== undefined) entity.costPrice = Number(dto.costPrice);
    if (dto.remark !== undefined) entity.remark = dto.remark;
    if (dto.pricePerMinute !== undefined) entity.pricePerMinute = Number(dto.pricePerMinute);
  }

  /** 实体 -> 管理端契约视图对象 */
  private toAdminModelItem(m: ModelEntity, provider?: ModelProviderEntity | null) {
    const inputTypes =
      Array.isArray(m.inputTypes) && m.inputTypes.length
        ? m.inputTypes
        : inputTypesFromModelType(m.modelType);
    const advancedCapabilities = Array.isArray(m.advancedCapabilities)
      ? m.advancedCapabilities
      : m.supportsFunctions
        ? ['function_calling']
        : [];
    // 旧字段兼容：vision / function_calling / streaming / reasoning / json_mode
    const capabilities: string[] = [];
    if (inputTypes.includes('image')) capabilities.push('vision');
    for (const c of advancedCapabilities) {
      if (
        c === 'function_calling' ||
        c === 'streaming' ||
        c === 'reasoning' ||
        c === 'json_mode'
      ) {
        capabilities.push(c);
      }
    }

    return {
      id: m.id,
      providerId: m.providerId ?? null,
      provider: m.provider,
      providerName: provider?.name ?? m.provider,
      modelId: m.modelId,
      upstreamModelId: m.upstreamModelId ?? m.modelId,
      modelType: m.modelType || 'chat',
      outputType: outputTypeFromModelType(m.modelType),
      inputTypes,
      advancedCapabilities,
      pricePerImage: m.pricePerImage ?? null,
      videoPrices: m.videoPrices ?? {},
      generationParams: m.generationParams ?? {},
      sortOrder: m.sortOrder ?? 0,
      pricePerCall: m.pricePerCall ?? null,
      callMode: m.callMode ?? callModeFromModelType(m.modelType),
      scenarioTags: m.scenarioTags ?? [],
      pricingMode: m.pricingMode ?? null,
      videoPerSecond: m.videoPerSecond ?? null,
      specs: m.specs ?? null,
      iconUrl: m.iconUrl ?? null,
      costPrice: m.costPrice ?? null,
      remark: m.remark ?? null,
      pricePerMinute: m.pricePerMinute ?? null,
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
      isGlobal: Boolean(p.isGlobal),
      apiStyle: p.apiStyle,
      rateLimitPerMinute: p.rateLimitPerMinute,
      concurrencyLimit: p.concurrencyLimit,
      balanceUrl: p.balanceUrl,
      balanceHeaders: p.balanceHeaders ?? null,
      balanceExtra: p.balanceExtra ?? null,
      lastBalance: p.lastBalance,
      balanceCheckedAt: p.balanceCheckedAt,
      balanceAlertThreshold: p.balanceAlertThreshold,
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

  /** 通用上游 JSON 调用（POST，按调用模式路由） */
  private async callUpstreamRaw(
    url: string,
    apiKey: string,
    body: Record<string, unknown>,
  ): Promise<any> {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const text = await resp.text();
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status} (${url}): ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /** 按调用模式构建测试请求体 */
  private buildTestBody(
    callMode: string,
    model: string,
    input: string,
  ): Record<string, unknown> {
    switch (callMode) {
      case 'text_chat':
      case 'vision':
        return { model, messages: [{ role: 'user', content: input || 'Hello' }], max_tokens: 50 };
      case 'embedding':
        return { model, input: [input || 'Hello'] };
      case 'rerank':
        return { model, query: input || 'Hello', documents: [input || 'Hello'] };
      case 'ocr':
        return { model, fileUrl: input };
      case 'stt':
        return { model, audioUrl: input };
      case 'tts':
        return { model, input: input || '你好' };
      case 'voice_conversion':
        return { model, audioUrl: input };
      case 'music':
        return { model, prompt: input || 'lofi piano', duration: 30 };
      case 'image':
      case 'image_edit':
        return { model, prompt: input, size: '1024x1024' };
      default:
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, `未知调用模式: ${callMode}`);
    }
  }

  /** 按调用模式格式化测试输出 */
  private formatTestOutput(callMode: string, out: any): string {
    if (callMode === 'image' || callMode === 'image_edit') {
      return JSON.stringify(out);
    }
    if (typeof out?.text === 'string') return out.text;
    if (typeof out?.choices?.[0]?.message?.content === 'string') {
      return out.choices[0].message.content;
    }
    if (typeof out?.url === 'string') return out.url;
    return JSON.stringify(out);
  }

  /** 调用模型 API 发起 chat/completions 测试请求 */
  private async callModelApi(
    endpoint: string,
    apiKey: string,
    modelId: string,
    input: string,
    config?: Record<string, unknown> | null,
  ): Promise<string> {
    const chatPath =
      typeof config?.chatPath === 'string' && config.chatPath.trim()
        ? config.chatPath.trim()
        : '/chat/completions';
    const url = this.buildApiUrl(endpoint, chatPath);
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
      throw new Error(`HTTP ${resp.status} (${url}): ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data?.choices?.[0]?.message?.content || JSON.stringify(data);
  }

  /** 拉取模型列表 (GET /models) */
  private async fetchModelList(endpoint: string, apiKey: string, config?: Record<string, unknown> | null): Promise<any> {
    const modelsPath = (config?.modelsPath as string) || '/models';
    const url = this.buildApiUrl(endpoint, modelsPath);
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
      throw new Error(`HTTP ${resp.status} (${url}): ${text.slice(0, 200)}`);
    }
    return resp.json();
  }

  /** 判断 chat 探测失败是否可回退到模型列表验证（连接本身可能有效） */
  private isChatProbeFallbackable(err: unknown): boolean {
    const msg = String((err as Error)?.message || err || '').toLowerCase();
    if (!/http (400|401|403|404|405|422)[:\s]/.test(msg)) return false;
    if (/model/.test(msg)) return true;
    return (
      /no static resource|resource not found|path not found|not found|不存在|无效路径/.test(msg) ||
      /no such (path|endpoint|url)|invalid (path|endpoint|url)/.test(msg) ||
      /\b404\b/.test(msg)
    );
  }

  /** 拼接上游 API URL：
   * - path 为完整 http(s) URL 时直接使用
   * - endpoint 为裸域名（无业务路径）且不以 /vN 结尾时补 /v1（OpenAI 兼容）
   * - 其余（如 DashScope /api/v1/services/... 原生端点）原样保留，不强制拼 /v1
   */
  private buildApiUrl(endpoint: string, path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = endpoint.replace(/\/+$/, '');
    try {
      const u = new URL(base);
      const bare = !u.pathname || u.pathname === '/' || u.pathname === '';
      if (bare && !/\/v\d+$/i.test(base) && !/\/v\d+(\/|$)/i.test(path)) {
        return `${base}/v1${path.startsWith('/') ? '' : '/'}${path}`;
      }
    } catch {
      /* 非 URL 原样拼接 */
    }
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelEntity } from '../model/entities/model.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { TestModelDto } from './dto/test-model.dto';
import { FetchModelsDto } from './dto/fetch-models.dto';
import { ImportModelsDto } from './dto/import-models.dto';

/** 模型供应商列表 */
const MODEL_PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'doubao', label: '豆包' },
  { value: 'qwen', label: '通义千问' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'other', label: '其他' },
];

/** 模型查询参数 */
interface ModelQuery {
  provider?: string;
  enabled?: boolean | string;
  page?: number;
  pageSize?: number;
}

/**
 * 管理端大模型配置服务
 * 数据合同真源：Task 23 - 大模型配置
 *
 * 复用现有 ModelEntity（models 表），字段映射：
 *   displayName       -> name
 *   inputPricePerToken -> pricePer1kInput
 *   outputPricePerToken-> pricePer1kOutput
 *   enabled           -> isActive
 *   capabilities      -> 由 supportsVision/supportsFunctions 派生
 */
@Injectable()
export class AdminModelService {
  constructor(
    @InjectRepository(ModelEntity)
    private modelRepo: Repository<ModelEntity>,
    private encryption: EncryptionService,
  ) {}

  // ============ 列表与详情 ============

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

    qb.orderBy('m.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    return {
      list: items.map((m) => this.toAdminModelItem(m)),
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
    return this.toAdminModelItem(model);
  }

  // ============ 增删改 ============

  /** 新增模型 */
  async create(dto: CreateModelDto) {
    const entity = new ModelEntity();
    this.applyCreateDto(entity, dto);
    const saved = await this.modelRepo.save(entity);
    return this.toAdminModelItem(saved);
  }

  /** 更新模型 */
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
    await this.modelRepo.delete(id);
  }

  // ============ 启用 / 禁用 ============

  /** 启用模型 */
  async enable(id: number) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    model.isActive = true;
    await this.modelRepo.save(model);
  }

  /** 禁用模型 */
  async disable(id: number) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    model.isActive = false;
    await this.modelRepo.save(model);
  }

  // ============ 测试 / 同步 ============

  /** 模型测试：用模型自身凭据发请求 */
  async test(id: number, dto: TestModelDto) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    if (!model.apiKey || !model.apiEndpoint) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '模型未配置 API 凭据，无法测试');
    }
    try {
      const apiKey = this.encryption.decryptAes(model.apiKey);
      const response = await this.callModelApi(
        model.apiEndpoint,
        apiKey,
        model.modelId,
        dto.input,
      );
      // 测试成功：更新连接状态
      model.connectionStatus = 'connected';
      model.lastTestedAt = new Date();
      await this.modelRepo.save(model);
      return { success: true, response };
    } catch (err: any) {
      model.connectionStatus = 'failed';
      model.lastTestedAt = new Date();
      await this.modelRepo.save(model);
      BusinessException.throw(ErrorCode.THIRD_PARTY_ERROR, `模型测试失败: ${err?.message || err}`);
    }
  }

  /** 拉取上游模型列表 */
  async fetchUpstreamModels(dto: FetchModelsDto) {
    const response = await this.fetchModelList(dto.apiEndpoint, dto.apiKey);
    const upstreamModels = this.parseModelList(response);
    // 标记已存在的模型
    const existing = await this.modelRepo.find({
      select: ['modelId'],
      where: upstreamModels.length > 0
        ? upstreamModels.map((m) => ({ modelId: m.modelId }))
        : undefined,
    });
    const existingIds = new Set(existing.map((e) => e.modelId));
    return {
      models: upstreamModels.map((m) => ({
        ...m,
        alreadyExists: existingIds.has(m.modelId),
      })),
    };
  }

  /** 批量导入模型 */
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

        // 倍率模式必须依赖上游价格，缺失时跳过并报错（避免静默导入 0 价模型）
        if (
          dto.pricingMode === 'multiplier' &&
          (item.upstreamInputPrice == null || item.upstreamOutputPrice == null)
        ) {
          errors.push({ modelId: item.modelId, error: '上游未返回该模型价格，倍率模式无法计算，请改用固定价(flat)模式或手动填写价格' });
          continue;
        }
        const inputPrice = this.calcPrice(
          item.upstreamInputPrice ?? 0,
          'input',
          dto,
        );
        const outputPrice = this.calcPrice(
          item.upstreamOutputPrice ?? 0,
          'output',
          dto,
        );

        const entity = this.modelRepo.create({
          provider: this.guessProvider(dto.apiEndpoint),
          modelId: item.modelId,
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

  /** 手动同步 OpenClaw（占位实现） */
  async sync(id: number) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    // 占位：实际同步逻辑由后续任务接入 OpenClaw 实现
  }

  // ============ 供应商 ============

  /** 供应商列表 */
  providers() {
    return MODEL_PROVIDERS;
  }

  // ============ 私有辅助 ============

  /** 将 DTO 应用到新建实体 */
  private applyCreateDto(entity: ModelEntity, dto: CreateModelDto) {
    entity.provider = dto.provider;
    entity.modelId = dto.modelId;
    entity.name = dto.displayName;
    entity.pricePer1kInput = dto.inputPricePerToken ?? 0;
    entity.pricePer1kOutput = dto.outputPricePerToken ?? 0;
    entity.isActive = dto.enabled;
    entity.supportsVision = dto.capabilities?.includes('vision') ?? false;
    entity.supportsFunctions = dto.capabilities?.includes('function_calling') ?? false;
    // 连接凭据：AES 加密存储
    if (dto.apiKey) {
      entity.apiKey = this.encryption.encryptAes(dto.apiKey);
    }
    if (dto.apiEndpoint) {
      entity.apiEndpoint = dto.apiEndpoint;
    }
  }

  /** 将 DTO 应用到已有实体（仅更新传入字段） */
  private applyUpdateDto(entity: ModelEntity, dto: UpdateModelDto) {
    if (dto.provider !== undefined) entity.provider = dto.provider;
    if (dto.modelId !== undefined) entity.modelId = dto.modelId;
    if (dto.displayName !== undefined) entity.name = dto.displayName;
    if (dto.inputPricePerToken !== undefined)
      entity.pricePer1kInput = dto.inputPricePerToken;
    if (dto.outputPricePerToken !== undefined)
      entity.pricePer1kOutput = dto.outputPricePerToken;
    if (dto.enabled !== undefined) entity.isActive = dto.enabled;
    if (dto.capabilities !== undefined) {
      entity.supportsVision = dto.capabilities.includes('vision');
      entity.supportsFunctions = dto.capabilities.includes('function_calling');
    }
    if (dto.apiKey) {
      entity.apiKey = this.encryption.encryptAes(dto.apiKey);
    }
    if (dto.apiEndpoint !== undefined) {
      entity.apiEndpoint = dto.apiEndpoint;
    }
  }

  /** 实体 -> 管理端契约视图对象 */
  private toAdminModelItem(m: ModelEntity) {
    const capabilities: string[] = [];
    if (m.supportsVision) capabilities.push('vision');
    if (m.supportsFunctions) capabilities.push('function_calling');

    return {
      id: m.id,
      provider: m.provider,
      modelId: m.modelId,
      displayName: m.name,
      apiKeyMasked: m.apiKey ? this.encryption.maskKey(m.apiKey) : undefined,
      apiEndpoint: m.apiEndpoint,
      connectionStatus: m.connectionStatus || 'untested',
      lastTestedAt: m.lastTestedAt,
      inputPricePerToken: m.pricePer1kInput ?? 0,
      outputPricePerToken: m.pricePer1kOutput ?? 0,
      minUserLevel: 1,
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

  // ============ 内部辅助 ============

  /** 猜测 provider */
  private guessProvider(endpoint: string): string {
    const u = endpoint.toLowerCase();
    if (u.includes('openai')) return 'openai';
    if (u.includes('doubao') || u.includes('volces')) return 'doubao';
    if (u.includes('dashscope') || u.includes('tongyi')) return 'qwen';
    if (u.includes('deepseek')) return 'deepseek';
    return 'other';
  }

  /** 按加价模式计算积分价格 */
  private calcPrice(
    upstreamPrice: number,
    type: 'input' | 'output',
    dto: ImportModelsDto,
  ): number {
    // 上游价格是元/千token，积分按 1元=100积分
    if (dto.pricingMode === 'multiplier') {
      const m = dto.multiplier ?? 1;
      return parseFloat((upstreamPrice * m * 100).toFixed(4));
    }
    if (dto.pricingMode === 'fixed') {
      const add = type === 'input' ? (dto.fixedInputAdd ?? 0) : (dto.fixedOutputAdd ?? 0);
      return parseFloat((upstreamPrice * 100 + add).toFixed(4));
    }
    // flat
    return type === 'input' ? (dto.flatInputPrice ?? 0) : (dto.flatOutputPrice ?? 0);
  }

  /** 调用模型 API 发起 chat/completions 测试请求 */
  private async callModelApi(
    endpoint: string,
    apiKey: string,
    modelId: string,
    input: string,
  ): Promise<string> {
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
  private async fetchModelList(endpoint: string, apiKey: string): Promise<any> {
    const url = this.normalizeEndpoint(endpoint) + '/models';
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    return resp.json();
  }

  /** 解析 /models 应答为标准列表（尽力读取上游价格：OpenAI /models 通常不含价格，部分中转站返回 pricing/metadata 字段） */
  private parseModelList(raw: any): Array<{
    modelId: string;
    ownedBy?: string;
    upstreamInputPrice?: number;
    upstreamOutputPrice?: number;
  }> {
    const dataArray = raw?.data ?? (Array.isArray(raw) ? raw : []);
    return dataArray.map((m: any) => {
      const meta = m?.api?.metadata ?? m?.metadata ?? m?.pricing ?? {};
      const priceOf = (v: unknown): number | undefined => {
        const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };
      // 常见格式: { input: xx, output: xx } 或 { prompt: xx, completion: xx } 或单值
      const input = priceOf(meta.input ?? meta.prompt ?? meta.input_price ?? meta.price);
      const output = priceOf(meta.output ?? meta.completion ?? meta.output_price ?? meta.price);
      return {
        modelId: m.id || m.modelId || '',
        ownedBy: m.owned_by || m.ownedBy || undefined,
        upstreamInputPrice: input,
        upstreamOutputPrice: output,
      };
    });
  }

  /** 去掉末尾 /v1 并加 /v1 */
  private normalizeEndpoint(endpoint: string): string {
    return endpoint.replace(/\/v1\/?$/, '').replace(/\/+$/, '') + '/v1';
  }
}

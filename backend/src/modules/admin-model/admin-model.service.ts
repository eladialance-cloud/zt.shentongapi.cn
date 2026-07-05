import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { ModelEntity } from '../model/entities/model.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import { TestModelDto } from './dto/test-model.dto';

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

  /** 模型测试（占位实现） */
  async test(id: number, _dto: TestModelDto) {
    const model = await this.modelRepo.findOne({ where: { id } });
    if (!model) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '模型不存在');
    }
    return { success: true, response: 'test ok' };
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
    entity.pricePer1kInput = dto.inputPricePerToken;
    entity.pricePer1kOutput = dto.outputPricePerToken;
    entity.isActive = dto.enabled;
    entity.supportsVision = dto.capabilities?.includes('vision') ?? false;
    entity.supportsFunctions = dto.capabilities?.includes('function_calling') ?? false;
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
      apiKeyMasked: undefined,
      apiEndpoint: undefined,
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
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelEntity } from '../entities/model.entity';

@Injectable()
export class ModelService {
  constructor(
    @InjectRepository(ModelEntity)
    private readonly modelRepo: Repository<ModelEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'model' };
  }

  /** 对话页可选模型（管理后台上线的启用模型，含积分单价；排除生成/向量模型） */
  async listChatOptions(): Promise<
    Array<{
      id: string;
      name: string;
      provider: string;
      modelType: string;
      inputPricePer1k: number | null;
      outputPricePer1k: number | null;
    }>
  > {
    const models = await this.modelRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
      relations: { pricing: true },
    });
    const excluded = new Set(['image', 'image_edit', 'video', 'tts', 'embedding', 'audio']);
    return models
      .filter((m) => !excluded.has((m.modelType || 'chat').toLowerCase()))
      .map((m) => ({
        id: m.modelId,
        name: m.name,
        provider: m.provider,
        modelType: m.modelType || 'chat',
        inputPricePer1k: m.pricing?.pricePer1kInput != null ? Number(m.pricing?.pricePer1kInput) : null,
        outputPricePer1k: m.pricing?.pricePer1kOutput != null ? Number(m.pricing?.pricePer1kOutput) : null,
      }));
  }

  /** 可用模型选项（创作者下拉，数据合同真源：desktop types/agent-creator CreatorModelOption） */
  async listOptions(): Promise<
    Array<{ id: number; name: string; provider?: string; modelType?: string; modelId?: string }>
  > {
    const models = await this.modelRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', id: 'ASC' },
    });
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      modelType: m.modelType || 'chat',
      modelId: m.modelId,
    }));
  }

  /** 校验模型是否存在且启用 */
  async existsActive(id: number): Promise<boolean> {
    if (!Number.isFinite(id) || id <= 0) return false;
    const count = await this.modelRepo.count({
      where: { id, isActive: true },
    });
    return count > 0;
  }

  /** 批量查询模型（用于回填模型名） */
  async findByIds(ids: number[]): Promise<ModelEntity[]> {
    const uniq = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
    if (!uniq.length) return [];
    return this.modelRepo
      .createQueryBuilder('m')
      .where('m.id IN (:...ids)', { ids: uniq })
      .getMany();
  }
}

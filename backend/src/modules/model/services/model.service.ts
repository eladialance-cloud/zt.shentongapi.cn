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

  /** 可用模型选项（创作者下拉，数据合同真源：desktop types/agent-creator CreatorModelOption） */
  async listOptions(): Promise<{ id: number; name: string; provider?: string }[]> {
    const models = await this.modelRepo.find({
      where: { isActive: true },
      order: { id: 'ASC' },
    });
    return models.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
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

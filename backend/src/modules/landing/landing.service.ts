import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LandingBlockEntity } from './entities/landing-block.entity';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';

/**
 * Landing 内容管理业务服务
 * 数据合同真源：Landing 内容管理模块
 */
@Injectable()
export class LandingService {
  constructor(
    @InjectRepository(LandingBlockEntity)
    private readonly blockRepository: Repository<LandingBlockEntity>,
  ) {}

  /**
   * 查询所有已启用的区块，按 sort_order 升序排列
   * 用于 C 端落地页内容渲染
   */
  async findAllEnabled(): Promise<LandingBlockEntity[]> {
    return this.blockRepository.find({
      where: { isEnabled: true },
      order: { sortOrder: 'ASC' },
    });
  }

  /**
   * 查询所有区块（管理端用）
   */
  async findAll(): Promise<LandingBlockEntity[]> {
    return this.blockRepository.find({
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  /**
   * 查询单个区块
   */
  async findOne(id: string): Promise<LandingBlockEntity> {
    const block = await this.blockRepository.findOne({ where: { id } });
    if (!block) {
      throw new NotFoundException(`Landing 区块不存在: ${id}`);
    }
    return block;
  }

  /**
   * 创建区块
   */
  async create(dto: CreateBlockDto): Promise<LandingBlockEntity> {
    const exists = await this.blockRepository.findOne({ where: { id: dto.id } });
    if (exists) {
      throw new ConflictException(`Landing 区块 ID 已存在: ${dto.id}`);
    }
    const block = this.blockRepository.create(dto);
    return this.blockRepository.save(block);
  }

  /**
   * 更新区块
   */
  async update(id: string, dto: UpdateBlockDto): Promise<void> {
    const block = await this.findOne(id);
    // 若 DTO 中显式传入了新的 id，需要避免冲突（但 UpdateBlockDto 继承 PartialType，id 可选）
    if (dto.id && dto.id !== id) {
      const conflict = await this.blockRepository.findOne({
        where: { id: dto.id },
      });
      if (conflict) {
        throw new ConflictException(`Landing 区块 ID 已存在: ${dto.id}`);
      }
    }
    Object.assign(block, dto);
    await this.blockRepository.save(block);
  }

  /**
   * 删除区块
   */
  async remove(id: string): Promise<void> {
    const block = await this.findOne(id);
    await this.blockRepository.remove(block);
  }

  /**
   * 批量更新排序
   */
  async updateOrder(orders: { id: string; sortOrder: number }[]): Promise<void> {
    await this.blockRepository.manager.transaction(async (manager) => {
      for (const item of orders) {
        const block = await manager.findOne(LandingBlockEntity, {
          where: { id: item.id },
        });
        if (!block) {
          throw new NotFoundException(`Landing 区块不存在: ${item.id}`);
        }
        block.sortOrder = item.sortOrder;
        await manager.save(block);
      }
    });
  }
}

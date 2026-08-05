import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RechargePlanEntity } from '../entities/recharge-plan.entity';

export interface CreateRechargePlanDto {
  name: string;
  credits: number;
  bonusCredits?: number;
  price: number;
  currency?: string;
  isRecommended?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/**
 * 充值档位管理服务（管理后台）
 * 数据合同真源：docs/superpowers/specs/2026-08-05-recharge-payment-config-design.md
 */
@Injectable()
export class RechargePlanService {
  constructor(
    @InjectRepository(RechargePlanEntity)
    private readonly planRepo: Repository<RechargePlanEntity>,
  ) {}

  /** 档位列表（含停用，管理端可见全部） */
  async list(): Promise<RechargePlanEntity[]> {
    return this.planRepo.find({ order: { sortOrder: 'ASC', price: 'ASC' } });
  }

  /** 新增档位 */
  async create(dto: CreateRechargePlanDto): Promise<RechargePlanEntity> {
    const plan = this.planRepo.create({
      name: dto.name,
      credits: dto.credits,
      bonusCredits: dto.bonusCredits ?? 0,
      price: dto.price,
      currency: dto.currency ?? 'CNY',
      isRecommended: dto.isRecommended ?? false,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.planRepo.save(plan);
  }

  /** 更新档位 */
  async update(id: number, dto: Partial<CreateRechargePlanDto>): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('充值档位不存在');
    if (dto.name !== undefined) plan.name = dto.name;
    if (dto.credits !== undefined) plan.credits = dto.credits;
    if (dto.bonusCredits !== undefined) plan.bonusCredits = dto.bonusCredits;
    if (dto.price !== undefined) plan.price = dto.price;
    if (dto.currency !== undefined) plan.currency = dto.currency;
    if (dto.isRecommended !== undefined) plan.isRecommended = dto.isRecommended;
    if (dto.isActive !== undefined) plan.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) plan.sortOrder = dto.sortOrder;
    await this.planRepo.save(plan);
  }

  /** 删除档位 */
  async remove(id: number): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('充值档位不存在');
    await this.planRepo.remove(plan);
  }
}

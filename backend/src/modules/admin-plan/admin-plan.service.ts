import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MembershipPlanEntity } from "../payment/entities/membership-plan.entity";

@Injectable()
export class AdminPlanService {
  constructor(
    @InjectRepository(MembershipPlanEntity)
    private readonly planRepo: Repository<MembershipPlanEntity>,
  ) {}

  async list(): Promise<MembershipPlanEntity[]> {
    const rows = await this.planRepo.find({ order: { price: "ASC" } });
    // 前端类型使用 benefits 字段；旧数据存在 features 列时回填，保证页面可展示
    for (const row of rows) {
      if (!row.benefits && row.features) row.benefits = row.features;
    }
    return rows;
  }

  async create(dto: {
    name: string;
    description?: string;
    price: number;
    credits: number;
    durationDays: number;
    level?: number;
    period?: string;
    benefits?: string[];
    features?: string[];
    isActive?: boolean;
  }): Promise<MembershipPlanEntity> {
    const plan = this.planRepo.create({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      credits: dto.credits,
      durationDays: dto.durationDays,
      features: dto.features || dto.benefits || [],
      benefits: dto.benefits || dto.features || [],
      level: dto.level ?? 0,
      period: dto.period || 'month',
      isActive: dto.isActive ?? true,
    });
    return this.planRepo.save(plan);
  }

  async update(
    id: number,
    dto: Partial<{
      name: string;
      description: string;
      price: number;
      credits: number;
      durationDays: number;
      level: number;
      period: string;
      benefits: string[];
      features: string[];
      isActive: boolean;
    }>,
  ): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException("套餐不存在");
    if (dto.name !== undefined) plan.name = dto.name;
    if (dto.description !== undefined) plan.description = dto.description;
    if (dto.price !== undefined) plan.price = dto.price;
    if (dto.credits !== undefined) plan.credits = dto.credits;
    if (dto.durationDays !== undefined) plan.durationDays = dto.durationDays;
    if (dto.features !== undefined) plan.features = dto.features;
    else if (dto.benefits !== undefined) plan.features = dto.benefits;
    if (dto.isActive !== undefined) plan.isActive = dto.isActive;
    await this.planRepo.save(plan);
  }

  async delete(id: number): Promise<void> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException("套餐不存在");
    await this.planRepo.remove(plan);
  }
}

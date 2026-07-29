import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipPlanEntity } from '../entities/membership-plan.entity';
import { CreatePlanDto, UpdatePlanDto } from '../dto/plan.dto';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(MembershipPlanEntity)
    private planRepo: Repository<MembershipPlanEntity>,
  ) {}

  health() {
    return { status: 'ok', module: 'payment' };
  }

  async getAllPlans(): Promise<MembershipPlanEntity[]> {
    return this.planRepo.find({ order: { createdAt: 'DESC' } });
  }

  async getActivePlans(): Promise<MembershipPlanEntity[]> {
    return this.planRepo.find({ where: { isActive: true }, order: { price: 'ASC' } });
  }

  async createPlan(dto: CreatePlanDto): Promise<MembershipPlanEntity> {
    const plan = this.planRepo.create({
      name: dto.name,
      description: dto.description,
      price: dto.price,
      credits: dto.credits,
      durationDays: dto.durationDays,
      features: dto.benefits,
      isActive: dto.isActive ?? true,
    });
    return this.planRepo.save(plan);
  }

  async updatePlan(id: number, dto: UpdatePlanDto): Promise<void> {
    const updateData: Partial<MembershipPlanEntity> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.credits !== undefined) updateData.credits = dto.credits;
    if (dto.durationDays !== undefined) updateData.durationDays = dto.durationDays;
    if (dto.benefits !== undefined) updateData.features = dto.benefits;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    await this.planRepo.update(id, updateData);
  }

  async deletePlan(id: number): Promise<void> {
    await this.planRepo.delete(id);
  }

  async togglePlanStatus(id: number): Promise<MembershipPlanEntity> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) {
      throw new Error('Plan not found');
    }
    plan.isActive = !plan.isActive;
    return this.planRepo.save(plan);
  }
}

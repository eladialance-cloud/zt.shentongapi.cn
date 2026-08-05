import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndustryCategoryEntity } from '../knowledge/entities/industry-category.entity';

/** 行业分类 CRUD（管理后台 /admin/industries） */
@Injectable()
export class IndustryService {
  constructor(
    @InjectRepository(IndustryCategoryEntity)
    private readonly industryRepo: Repository<IndustryCategoryEntity>,
  ) {}

  async list(): Promise<IndustryCategoryEntity[]> {
    return this.industryRepo.find({ order: { sortOrder: 'ASC' } });
  }

  async create(dto: { name: string; sortOrder?: number }): Promise<IndustryCategoryEntity> {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('行业名称不能为空');
    const exists = await this.industryRepo.findOne({ where: { name } });
    if (exists) throw new ConflictException('行业名称已存在');
    return this.industryRepo.save(
      this.industryRepo.create({ name, sortOrder: dto.sortOrder ?? 0 }),
    );
  }

  async update(
    id: number,
    dto: { name?: string; sortOrder?: number },
  ): Promise<void> {
    const cat = await this.industryRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('行业分类不存在');
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('行业名称不能为空');
      const exists = await this.industryRepo.findOne({ where: { name } });
      if (exists && exists.id !== id) throw new ConflictException('行业名称已存在');
      cat.name = name;
    }
    if (dto.sortOrder !== undefined) cat.sortOrder = dto.sortOrder;
    await this.industryRepo.save(cat);
  }

  async remove(id: number): Promise<void> {
    const cat = await this.industryRepo.findOne({ where: { id } });
    if (!cat) throw new NotFoundException('行业分类不存在');
    await this.industryRepo.remove(cat);
  }
}

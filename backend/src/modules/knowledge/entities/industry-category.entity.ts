import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** 行业分类（官方知识库按行业归类） */
@Entity('industry_categories')
export class IndustryCategoryEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  name: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}

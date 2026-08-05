import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('recharge_plans')
export class RechargePlanEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  name: string;

  @Column({ type: 'int' })
  credits: number;

  @Column({ name: 'bonus_credits', type: 'int', default: 0 })
  bonusCredits: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ length: 8, default: 'CNY' })
  currency: string;

  @Column({ name: 'is_recommended', type: 'boolean', default: false })
  isRecommended: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}

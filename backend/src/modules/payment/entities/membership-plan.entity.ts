import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('membership_plans')
export class MembershipPlanEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'int' })
  credits: number;

  @Column({ name: 'duration_days', type: 'int' })
  durationDays: number;

  @Column({ type: 'json', nullable: true })
  features?: string[];

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}

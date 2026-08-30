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

  /** 对应会员等级（0=免费/1=专业/2=企业），表结构来自 init.sql */
  @Column({ type: 'int', default: 0 })
  level: number;

  /** 计费周期（month/year/forever 等） */
  @Column({ type: 'varchar', length: 32, default: 'month' })
  period: string;

  /** 权益列表（表结构来自 init.sql，前端字段名） */
  @Column({ type: 'json', nullable: true })
  benefits?: string[];

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
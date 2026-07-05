import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('revenue_records')
export class RevenueRecordEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({
    type: 'enum',
    enum: ['agent_sale', 'recharge', 'referral', 'withdrawal', 'adjustment'],
  })
  source: 'agent_sale' | 'recharge' | 'referral' | 'withdrawal' | 'adjustment';

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ name: 'reference_id', type: 'bigint', nullable: true })
  referenceId?: number;

  @Column({ length: 512, nullable: true })
  description?: string;
}

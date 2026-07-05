import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('withdrawal_records')
export class WithdrawalRecordEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Index()
  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'paid'],
    default: 'pending',
  })
  status: 'pending' | 'approved' | 'rejected' | 'paid';

  @Column({ length: 32, nullable: true })
  channel?: string;

  @Column({ name: 'account_info', type: 'json', nullable: true })
  accountInfo?: Record<string, unknown>;

  @Column({ name: 'rejected_reason', length: 512, nullable: true })
  rejectedReason?: string;

  @Column({ name: 'paid_at', type: 'datetime', nullable: true })
  paidAt?: Date;
}

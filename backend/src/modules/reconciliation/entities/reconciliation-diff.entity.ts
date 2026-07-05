import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ReconciliationDiffType =
  | 'balance_vs_txn'
  | 'token_usage'
  | 'payment_vs_order'
  | 'apikey_pool_deduction';

export type ReconciliationDiffStatus = 'pending' | 'resolved' | 'ignored';

/**
 * 对账差异实体
 * 数据合同真源：Task 30 - 对账体系
 */
@Entity('reconciliation_diff')
export class ReconciliationDiffEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Column({ length: 32 })
  type: ReconciliationDiffType;

  @Index()
  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: number;

  @Column({ name: 'diff_amount', type: 'decimal', precision: 12, scale: 4 })
  diffAmount: number;

  @Column({ type: 'json', nullable: true })
  detail?: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'pending',
  })
  status: ReconciliationDiffStatus;

  @Column({ name: 'resolved_by', type: 'bigint', nullable: true })
  resolvedBy?: number;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt?: Date;

  @Column({ length: 512, nullable: true })
  remark?: string;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

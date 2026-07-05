import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type CreditTxnType =
  | 'recharge'
  | 'consume'
  | 'freeze'
  | 'settle'
  | 'refund'
  | 'reward'
  | 'admin_adjust';

export type CreditTxnSource =
  | 'model_call'
  | 'plugin_call'
  | 'workflow_call'
  | 'kb_search'
  | 'recharge'
  | 'admin_adjust'
  | 'signup_reward';

/**
 * 积分流水实体（不可变，仅追加）
 * 数据合同真源：Task 29 - 积分数据流完整链路
 */
@Entity('credit_transactions')
export class CreditTransactionEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ length: 32 })
  type: CreditTxnType;

  @Column({ type: 'int' })
  amount: number;

  @Column({ name: 'balance_before', type: 'int' })
  balanceBefore: number;

  @Column({ name: 'balance_after', type: 'int' })
  balanceAfter: number;

  @Column({ length: 32 })
  source: CreditTxnSource;

  @Index()
  @Column({ name: 'source_id', length: 64 })
  sourceId: string;

  @Index()
  @Column({ name: 'frozen_txn_id', type: 'bigint', nullable: true })
  frozenTxnId?: number;

  @Column({ length: 512, nullable: true })
  remark?: string;

  @Column({ name: 'admin_id', type: 'bigint', nullable: true })
  adminId?: number;

  /** 结算幂等标记：结算成功后写入，再次结算直接返回 */
  @Column({ name: 'settled_at', type: 'datetime', nullable: true })
  settledAt?: Date;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

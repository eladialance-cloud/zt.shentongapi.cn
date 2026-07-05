import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type SyncRecordType =
  | 'chat_message'
  | 'agent_call'
  | 'workflow_execution'
  | 'plugin_call';

export type SyncRecordStatus = 'pending' | 'processed' | 'failed';

/**
 * 同步记录实体（客户端上行数据）
 * 数据合同真源：Task 31 - 数据同步设计
 */
@Entity('sync_records')
export class SyncRecordEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Index({ unique: true })
  @Column({ name: 'client_txn_id', length: 64 })
  clientTxnId: string;

  @Column({ length: 32 })
  type: SyncRecordType;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 16,
    default: 'pending',
  })
  status: SyncRecordStatus;

  @Column({ name: 'error_msg', type: 'text', nullable: true })
  errorMsg?: string;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processedAt?: Date;
}

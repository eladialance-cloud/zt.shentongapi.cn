import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 审核队列实体
 * 数据合同真源：Task 25 - 内容审核 / frontend types/admin-audit AuditQueueItem
 *
 * 统一记录各业务（会话/Agent/插件/工作流）触发的待审核条目。
 * 表名：audit_queue
 */
@Entity('audit_queue')
export class AuditQueueEntity extends BaseEntity {
  @Index()
  @Column({
    type: 'enum',
    enum: ['conversation', 'agent', 'plugin', 'workflow'],
  })
  type: 'conversation' | 'agent' | 'plugin' | 'workflow';

  @Column({ name: 'content_summary', length: 512 })
  contentSummary: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ length: 64, nullable: true })
  username?: string;

  @Column({
    name: 'trigger_reason',
    type: 'enum',
    enum: ['sensitive_word', 'ai_audit'],
    default: 'sensitive_word',
  })
  triggerReason: 'sensitive_word' | 'ai_audit';

  @Column({ name: 'hit_words', type: 'json', nullable: true })
  hitWords?: string[];

  @Column({
    name: 'risk_level',
    type: 'enum',
    enum: ['low', 'medium', 'high'],
    default: 'low',
  })
  riskLevel: 'low' | 'medium' | 'high';

  @Index()
  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'false_positive'],
    default: 'pending',
  })
  status: 'pending' | 'approved' | 'rejected' | 'false_positive';

  @Column({ name: 'processed_by', length: 64, nullable: true })
  processedBy?: string;

  @Column({ name: 'processed_at', type: 'datetime', nullable: true })
  processedAt?: Date;

  @Column({ name: 'process_remark', length: 512, nullable: true })
  processRemark?: string;
}

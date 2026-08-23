import { Entity, Column } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/** 需求单状态 */
export type BriefStatus = 'draft' | 'confirmed' | 'executing' | 'completed' | 'cancelled';

/** 派发状态 */
export type DispatchStatus = 'none' | 'pending' | 'done' | 'failed';

/** 派发任务项（dispatch_result 元素） */
export interface DispatchTaskItem {
  roleTitle: string;
  taskTitle: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  dependsOn?: string[];
}

/**
 * 需求单
 * 字段与 db-migration.ts 的 briefs 表一致
 */
@Entity('briefs')
export class BriefEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ length: 128 })
  title: string;

  @Column({ type: 'text', nullable: true })
  goal?: string;

  @Column({ name: 'target_audience', length: 255, nullable: true })
  targetAudience?: string;

  @Column({ type: 'json', nullable: true })
  platforms?: string[];

  @Column({ length: 512, nullable: true })
  style?: string;

  @Column({ name: 'deadline', type: 'datetime', nullable: true })
  deadline?: Date;

  @Column({
    type: 'enum',
    enum: ['draft', 'confirmed', 'executing', 'completed', 'cancelled'],
    default: 'draft',
  })
  status: BriefStatus;

  @Column({
    name: 'dispatch_status',
    type: 'enum',
    enum: ['none', 'pending', 'done', 'failed'],
    default: 'none',
  })
  dispatchStatus: DispatchStatus;

  @Column({ name: 'dispatch_result', type: 'json', nullable: true })
  dispatchResult?: DispatchTaskItem[] | null;

  @Column({ name: 'dispatch_error', type: 'varchar', length: 512, nullable: true })
  dispatchError?: string | null;

  @Column({ name: 'dispatch_params', type: 'json', nullable: true })
  dispatchParams?: {
    executeMode: 'team' | 'auto' | 'agent';
    teamId?: number | null;
    agentId?: number | null;
  } | null;

  @Column({
    name: 'source_chat_session_id',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  sourceChatSessionId?: number;

  @Column({ name: 'source_chat_summary', type: 'text', nullable: true })
  sourceChatSummary?: string;
}
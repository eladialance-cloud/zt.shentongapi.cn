import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 工作流模板实体
 * 数据合同真源：Task 21 - 工作流模板管理 / desktop types/admin-workflow
 *
 * 现有 workflow 模块仅有 health()，无实体，故在此创建最小可用的管理端实体。
 */
export type WorkflowEngineType = 'n8n' | 'coze';
export type AdminWorkflowCategory =
  | 'automation'
  | 'integration'
  | 'data_processing'
  | 'other';
export type WorkflowReviewStatus = 'pending_review' | 'approved' | 'rejected';

@Entity('workflows')
export class WorkflowEntity extends BaseEntity {
  @Index()
  @Column({ length: 128 })
  name: string;

  @Column({ length: 1024, nullable: true })
  description?: string;

  @Column({ name: 'engine_type', length: 16, default: 'n8n' })
  engineType: WorkflowEngineType;

  @Column({ name: 'n8n_workflow_id', length: 64, nullable: true })
  n8nWorkflowId?: string;

  @Column({ name: 'coze_workflow_id', length: 64, nullable: true })
  cozeWorkflowId?: string;

  @Column({ length: 32, default: 'other' })
  category: AdminWorkflowCategory;

  @Column({ name: 'input_schema', type: 'json', nullable: true })
  inputSchema?: Record<string, unknown>;

  @Column({ name: 'output_schema', type: 'json', nullable: true })
  outputSchema?: Record<string, unknown>;

  @Column({ name: 'price_per_execution', type: 'int', default: 0 })
  pricePerExecution: number;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({
    name: 'review_status',
    length: 32,
    default: 'pending_review',
  })
  reviewStatus: WorkflowReviewStatus;

  @Column({ name: 'reject_reason', length: 512, nullable: true })
  rejectReason?: string;

  @Column({ name: 'execution_count', type: 'int', default: 0 })
  executionCount: number;

  @Column({ name: 'creator_name', length: 64, nullable: true })
  creatorName?: string;
}

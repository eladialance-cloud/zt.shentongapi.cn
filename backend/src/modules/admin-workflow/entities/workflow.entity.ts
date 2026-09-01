import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 工作流模板实体（合并 workflows + task_n8n_workflow_lib）
 *
 * 一张表承载：管理端手动创建 + GitHub 批量导入 + 审核流 + 定价
 */
export type WorkflowEngineType = 'n8n' | 'coze';
export type WorkflowCategory =
  | 'automation'
  | 'integration'
  | 'data_processing'
  | 'ai_collaboration'
  | 'independent'
  | 'other';
export type WorkflowSceneCategory =
  | 'hotspot_monitor'
  | 'multi_platform_distribution'
  | 'comment_dm_ops'
  | 'commercial_data_review'
  | 'other';
export type WorkflowReviewStatus = 'pending_review' | 'approved' | 'rejected';
export type WorkflowPublishStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'published'
  | 'rejected';

@Entity('workflows')
export class WorkflowEntity extends BaseEntity {
  // ── 基础信息 ──
  @Index()
  @Column({ length: 128 })
  name: string;

  @Column({ length: 1024, nullable: true })
  description?: string;

  @Column({ name: 'engine_type', length: 16, default: 'n8n' })
  engineType: WorkflowEngineType;

  @Column({ length: 64, default: 'other' })
  category: WorkflowCategory;
  @Column({ name: 'scene_category', length: 32, default: 'other' })
  sceneCategory: WorkflowSceneCategory;

  @Column({ name: 'source_type', length: 16, default: 'manual' })
  sourceType: 'github' | 'manual';

  @Column({ name: 'github_topics', type: 'json', nullable: true })
  githubTopics?: string[];

  @Column({ type: 'json', nullable: true })
  pricing?: Record<string, unknown>;

  // ── n8n 工作流 JSON 定义（核心） ──
  @Column({ name: 'workflow_json', type: 'mediumtext', nullable: true })
  workflowJson?: string;

  // ── 参数/输出 Schema ──
  @Column({ name: 'input_schema', type: 'json', nullable: true })
  inputSchema?: Record<string, unknown>;

  @Column({ name: 'output_schema', type: 'json', nullable: true })
  outputSchema?: Record<string, unknown>;

  // ── 引擎 ID（兼容旧字段） ──
  @Column({ name: 'n8n_workflow_id', length: 64, nullable: true })
  n8nWorkflowId?: string;

  @Column({ name: 'coze_workflow_id', length: 64, nullable: true })
  cozeWorkflowId?: string;

  // ── GitHub 来源追溯 ──
  @Column({ name: 'source_repo', length: 256, nullable: true })
  sourceRepo?: string;

  @Column({ name: 'source_path', length: 512, nullable: true })
  sourcePath?: string;

  @Column({ length: 32, nullable: true })
  version?: string;

  // ── 展示 ──
  @Column({ length: 256, nullable: true })
  icon?: string;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  // ── 定价 ──
  @Column({ name: 'price_per_execution', type: 'int', default: 0 })
  pricePerExecution: number;

  // ── 状态 ──
  @Column({ name: 'is_active', type: 'boolean', default: false })
  isActive: boolean;

  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  // ── 审核流 ──
  @Index()
  @Column({
    name: 'review_status',
    length: 32,
    default: 'pending_review',
  })
  reviewStatus: WorkflowReviewStatus;

  @Index()
  @Column({
    name: 'publish_status',
    type: 'enum',
    enum: ['draft', 'pending_review', 'approved', 'published', 'rejected'],
    default: 'draft',
  })
  publishStatus: WorkflowPublishStatus;

  @Column({ name: 'reject_reason', length: 512, nullable: true })
  rejectReason?: string;

  // ── 统计 ──
  @Column({ name: 'execution_count', type: 'int', default: 0 })
  executionCount: number;

  @Column({ name: 'node_count', type: 'int', default: 0 })
  nodeCount: number;

  // ── 触发类型（从 JSON 解析提取） ──
  @Column({ name: 'trigger_type', length: 64, nullable: true })
  triggerType?: string;

  // ── 创建者 ──
  @Column({ name: 'creator_name', length: 64, nullable: true })
  creatorName?: string;
}

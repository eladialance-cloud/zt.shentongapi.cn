import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('agents')
export class AgentEntity extends BaseEntity {
  @Column({ length: 64 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ length: 512, nullable: true })
  avatar?: string;

  @Column({ name: 'system_prompt', type: 'text' })
  systemPrompt: string;

  @Column({ name: 'usage_example', type: 'text', nullable: true })
  usageExample?: string;

  @Index()
  @Column({ name: 'model_id', length: 64 })
  modelId: string;

  @Column({ name: 'price_per_call', type: 'int', default: 0 })
  pricePerCall: number;

  @Column({ name: 'price_per_token', type: 'json', nullable: true })
  pricePerToken?: { input: number; output: number };

  @Index()
  @Column({ name: 'creator_id', type: 'bigint' })
  creatorId: number;

  @Column({
    name: 'creator_type',
    type: 'enum',
    enum: ['official', 'user'],
    default: 'user',
  })
  creatorType: 'official' | 'user';

  @Index()
  @Column({
    type: 'enum',
    enum: ['draft', 'pending_review', 'published', 'rejected', 'offline'],
    default: 'draft',
  })
  status: 'draft' | 'pending_review' | 'published' | 'rejected' | 'offline';

  @Index()
  @Column({
    type: 'enum',
    enum: ['office', 'programming', 'copywriting', 'data_analysis', 'other'],
    default: 'other',
  })
  category: 'office' | 'programming' | 'copywriting' | 'data_analysis' | 'other';

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ name: 'allowed_plugin_ids', type: 'json', nullable: true })
  allowedPluginIds?: number[];

  @Column({ name: 'allowed_workflow_ids', type: 'json', nullable: true })
  allowedWorkflowIds?: number[];

  @Column({ name: 'allowed_knowledge_base_ids', type: 'json', nullable: true })
  allowedKnowledgeBaseIds?: number[];

  @Index()
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  rating: number;

  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount: number;

  @Index()
  @Column({ name: 'call_count', type: 'int', default: 0 })
  callCount: number;

  @Column({ type: 'int', default: 0 })
  revenue: number;

  @Column({ name: 'rejection_reason', length: 512, nullable: true })
  rejectionReason?: string;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt?: Date;

  @Index({ unique: true })
  @Column({ name: 'openclaw_agent_id', length: 64, nullable: true })
  openclawAgentId?: string;

  @Column({
    name: 'source_type',
    type: 'enum',
    enum: ['official', 'user', 'imported'],
    default: 'user',
  })
  sourceType: 'official' | 'user' | 'imported';

  @Column({ name: 'source_name', length: 128, nullable: true })
  sourceName?: string;

  @Column({ name: 'source_repo_url', length: 512, nullable: true })
  sourceRepoUrl?: string;

  @Column({ name: 'source_file_path', length: 512, nullable: true })
  sourceFilePath?: string;

  @Column({ name: 'source_category', length: 64, nullable: true })
  sourceCategory?: string;

  @Column({ name: 'source_version', length: 32, nullable: true })
  sourceVersion?: string;

  @Column({
    name: 'runtime_type',
    type: 'enum',
    enum: ['openclaw', 'hermes', 'hybrid'],
    default: 'openclaw',
  })
  runtimeType: 'openclaw' | 'hermes' | 'hybrid';

  @Column({ name: 'is_official', type: 'boolean', default: false })
  isOfficial: boolean;

  @Column({ name: 'official_visible', type: 'boolean', default: true })
  officialVisible: boolean;

  @Column({
    name: 'sync_status',
    type: 'enum',
    enum: ['pending', 'synced', 'failed'],
    default: 'pending',
  })
  syncStatus: 'pending' | 'synced' | 'failed';

  @Column({ name: 'sync_error', length: 512, nullable: true })
  syncError?: string;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;
}

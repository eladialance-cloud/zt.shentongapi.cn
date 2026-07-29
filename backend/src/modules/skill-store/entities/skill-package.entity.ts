import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('skill_packages')
export class SkillPackageEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  name: string;

  @Column({ name: 'display_name', length: 512 })
  displayName: string;

  @Column({ length: 512 })
  description: string;

  @Column({ name: 'skill_type', length: 32, default: 'skill' })
  skillType: 'skill' | 'workflow';

  @Column({ name: 'runtime_type', length: 32 })
  runtimeType: string;

  @Column({ length: 32, nullable: true })
  category?: string;

  @Column({ name: 'source_url', length: 512 })
  sourceUrl: string;

  @Column({ name: 'install_path', length: 512, nullable: true })
  installPath?: string;

  @Column({ name: 'skill_md_path', length: 512, nullable: true })
  skillMdPath?: string;

  @Column({ name: 'entry_point', length: 256, nullable: true })
  entryPoint?: string;

  @Column({ name: 'input_schema', type: 'json', nullable: true })
  inputSchema?: Record<string, unknown>;

  @Column({ name: 'output_schema', type: 'json', nullable: true })
  outputSchema?: Record<string, unknown>;

  @Column({ type: 'json', nullable: true })
  dependencies?: Record<string, unknown>;

  @Column({ name: 'trigger_keywords', type: 'json', nullable: true })
  triggerKeywords?: string[];

  @Column({ type: 'json', nullable: true })
  examples?: Record<string, unknown>[];

  @Column({ name: 'ui_config', type: 'json', nullable: true })
  uiConfig?: Record<string, unknown>;

  @Column({ name: 'opc_agent_config', type: 'json', nullable: true })
  opcAgentConfig?: Record<string, unknown>;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['draft', 'reviewing', 'approved', 'published', 'unpublished', 'failed'],
    default: 'draft',
  })
  status: 'draft' | 'reviewing' | 'approved' | 'published' | 'unpublished' | 'failed';

  @Column({
    name: 'review_status',
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  reviewStatus: 'pending' | 'approved' | 'rejected';

  @Column({ name: 'review_note', length: 512, nullable: true })
  reviewNote?: string;

  @Column({ name: 'is_official', type: 'boolean', default: false })
  isOfficial: boolean;

  @Column({ name: 'call_count', type: 'int', default: 0 })
  callCount: number;

  @Column({ name: 'avg_rating', type: 'decimal', precision: 3, scale: 2, default: 0 })
  avgRating: number;

  @Column({ length: 32, default: '1.0.0' })
  version: string;
}

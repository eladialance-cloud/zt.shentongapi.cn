import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('plugins')
export class PluginEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ length: 32 })
  version: string;
  @Column({ length: 32, nullable: true })
  category?: string;

  @Column({ name: 'source_type', length: 16, default: 'manual' })
  sourceType: 'github' | 'manual';

  @Column({ name: 'source_repo', length: 512, nullable: true })
  sourceRepo?: string;

  @Column({ name: 'source_path', length: 512, nullable: true })
  sourcePath?: string;

  @Column({ name: 'github_topics', type: 'json', nullable: true })
  githubTopics?: string[];

  @Column({ type: 'json', nullable: true })
  pricing?: Record<string, unknown>;

  @Column({ name: 'mcp_server_url', length: 512, nullable: true })
  mcpServerUrl?: string;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;

  @Column({ name: 'is_official', type: 'boolean', default: false })
  isOfficial: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
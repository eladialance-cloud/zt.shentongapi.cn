import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type McpRuntime = 'node' | 'python' | 'docker' | 'http';
export type McpSecurityLevel = 'official' | 'community';

export interface EnvTemplateItem {
  key: string;
  label: string;
  required?: boolean;
  secret?: boolean;
  default?: string;
  description?: string;
}

@Entity('eco_mcp_catalog')
export class McpCatalogEntity extends BaseEntity {
  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Index()
  @Column({ length: 32, nullable: true })
  category?: string;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ length: 512, nullable: true })
  icon?: string;

  @Column({ length: 512, nullable: true })
  homepage?: string;

  @Column({ name: 'source_url', length: 512, nullable: true })
  sourceUrl?: string;
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

  @Column({ length: 64, nullable: true })
  license?: string;

  @Column({ type: 'enum', enum: ['node', 'python', 'docker', 'http'], default: 'node' })
  runtime: McpRuntime;

  @Column({ name: 'security_level', type: 'enum', enum: ['official', 'community'], default: 'community' })
  securityLevel: McpSecurityLevel;

  @Column({ name: 'transport_type', type: 'enum', enum: ['stdio', 'http', 'streamable-http'], default: 'stdio' })
  transportType: 'stdio' | 'http' | 'streamable-http';

  @Column({ length: 256, nullable: true })
  command?: string;

  @Column({ type: 'json', nullable: true })
  args?: string[];

  @Column({ name: 'env_template', type: 'json', nullable: true })
  envTemplate?: EnvTemplateItem[];

  @Column({ length: 512, nullable: true })
  url?: string;

  @Column({ type: 'json', nullable: true })
  headers?: Record<string, string>;

  @Column({ length: 32, default: '1.0.0' })
  version: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'tool_count', type: 'int', default: 0 })
  toolCount: number;

  @Column({ name: 'download_count', type: 'int', default: 0 })
  downloadCount: number;
}

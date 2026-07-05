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

  @Column({ name: 'mcp_server_url', length: 512, nullable: true })
  mcpServerUrl?: string;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;

  @Column({ name: 'is_official', type: 'boolean', default: false })
  isOfficial: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}

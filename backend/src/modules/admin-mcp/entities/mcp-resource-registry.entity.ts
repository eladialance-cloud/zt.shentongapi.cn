import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * MCP 资源注册实体
 * 记录每个 MCP Server 暴露的资源信息
 */
@Entity('ai_mcp_resource_registry')
export class McpResourceRegistryEntity extends BaseEntity {
  @Index()
  @Column({ name: 'server_id', type: 'bigint' })
  serverId: number;

  @Column({ name: 'resource_uri', length: 256 })
  resourceUri: string;

  @Column({
    name: 'resource_type',
    type: 'enum',
    enum: ['agent', 'workflow', 'data', 'file', 'prompt'],
    default: 'agent',
  })
  resourceType: 'agent' | 'workflow' | 'data' | 'file' | 'prompt';

  @Column({ name: 'display_name', length: 128, nullable: true })
  displayName?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;
}

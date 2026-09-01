import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * MCP 服务配置实体
 * 存储 MCP Server 的连接配置与运行状态
 */
@Entity('ai_mcp_server_config')
export class McpServerConfigEntity extends BaseEntity {
  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({
    name: 'transport_type',
    type: 'enum',
    enum: ['stdio', 'http', 'streamable-http'],
    default: 'stdio',
  })
  transportType: 'stdio' | 'http' | 'streamable-http';

  @Column({ length: 256, nullable: true })
  command?: string;

  @Column({ type: 'json', nullable: true })
  args?: string[];

  @Column({ type: 'json', nullable: true })
  env?: Record<string, string>;

  @Column({ length: 512, nullable: true })
  url?: string;

  @Column({ type: 'json', nullable: true })
  headers?: Record<string, string>;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({
    name: 'service_type',
    type: 'enum',
    enum: ['openclaw', 'codex', 'n8n', 'custom'],
    default: 'custom',
  })
  serviceType: 'openclaw' | 'codex' | 'n8n' | 'custom';

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({
    type: 'enum',
    enum: ['pending', 'connected', 'failed', 'disabled'],
    default: 'pending',
  })
  status: 'pending' | 'connected' | 'failed' | 'disabled';

  @Column({ name: 'last_connected_at', type: 'datetime', nullable: true })
  lastConnectedAt?: Date;

  @Column({ name: 'tool_count', type: 'int', default: 0 })
  toolCount: number;
}

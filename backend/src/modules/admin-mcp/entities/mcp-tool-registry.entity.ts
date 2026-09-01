import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * MCP 工具注册实体
 * 记录每个 MCP Server 暴露的工具信息
 */
@Entity('ai_mcp_tool_registry')
@Unique('uk_server_tool', ['serverId', 'toolName'])
export class McpToolRegistryEntity extends BaseEntity {
  @Index()
  @Column({ name: 'server_id', type: 'bigint' })
  serverId: number;

  @Column({ name: 'tool_name', length: 128 })
  toolName: string;

  @Column({ name: 'display_name', length: 128, nullable: true })
  displayName?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'input_schema', type: 'json', nullable: true })
  inputSchema?: Record<string, unknown>;

  @Column({ length: 64, nullable: true })
  category?: string;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ name: 'call_count', type: 'int', default: 0 })
  callCount: number;
}

import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * MCP 调用日志实体
 * 记录工具调用与资源访问的审计日志
 */
@Entity('mcp_call_log')
export class McpCallLogEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: number;

  @Index()
  @Column({ name: 'server_id', type: 'bigint', nullable: true })
  serverId?: number;

  @Column({ name: 'tool_name', length: 128, nullable: true })
  toolName?: string;

  @Column({ name: 'resource_uri', length: 256, nullable: true })
  resourceUri?: string;

  @Column({
    name: 'call_type',
    type: 'enum',
    enum: ['tool', 'resource'],
    default: 'tool',
  })
  callType: 'tool' | 'resource';

  @Column({ name: 'request_data', type: 'json', nullable: true })
  requestData?: Record<string, unknown>;

  @Column({ name: 'response_data', type: 'json', nullable: true })
  responseData?: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: ['success', 'failed', 'timeout'],
    default: 'success',
  })
  status: 'success' | 'failed' | 'timeout';

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs?: number;
}

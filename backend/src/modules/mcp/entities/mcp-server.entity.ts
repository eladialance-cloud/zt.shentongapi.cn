import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * MCP Server 配置实体
 * 存储用户配置的 MCP Server 信息，支持 stdio / http / streamable-http 三种传输方式
 */
@Entity('eco_mcp_servers')
export class McpServerEntity extends BaseEntity {
  /** 用户 ID */
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  /** 服务器名称 */
  @Column({ length: 128 })
  name: string;

  /** 描述 */
  @Column({ length: 512, nullable: true })
  description?: string;

  /** 传输类型: stdio | http | streamable-http */
  @Column({
    name: 'transport_type',
    type: 'enum',
    enum: ['stdio', 'http', 'streamable-http'],
    default: 'stdio',
  })
  transportType: 'stdio' | 'http' | 'streamable-http';

  /** stdio 模式下的启动命令（如 node、python、npx） */
  @Column({ length: 256, nullable: true })
  command?: string;

  /** stdio 模式下的命令参数（JSON 数组） */
  @Column({ type: 'json', nullable: true })
  args?: string[];

  /** stdio 模式下的环境变量（JSON 对象） */
  @Column({ type: 'json', nullable: true })
  env?: Record<string, string>;

  /** http / streamable-http 模式下的服务器 URL */
  @Column({ length: 512, nullable: true })
  url?: string;

  /** http / streamable-http 模式下的请求头（JSON 对象） */
  @Column({ type: 'json', nullable: true })
  headers?: Record<string, string>;

  /** 是否启用 */
  @Column({ name: 'enabled', type: 'boolean', default: true })
  enabled: boolean;

  /** 最后连接时间 */
  @Column({ name: 'last_connected_at', type: 'datetime', nullable: true })
  lastConnectedAt?: Date;

  /** 工具数量 */
  @Column({ name: 'tool_count', type: 'int', default: 0 })
  toolCount: number;

  /** 连接状态: pending | connected | failed | disabled */
  @Column({
    type: 'enum',
    enum: ['pending', 'connected', 'failed', 'disabled'],
    default: 'pending',
  })
  status: 'pending' | 'connected' | 'failed' | 'disabled';

  @Column({ length: 16, default: 'custom' })
  source: 'custom' | 'official' | 'chat';

  @Column({ name: 'catalog_id', type: 'bigint', nullable: true })
  catalogId?: number;
}

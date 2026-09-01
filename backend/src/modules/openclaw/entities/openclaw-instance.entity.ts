import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/**
 * OpenClaw 运行时实例注册表
 * 管理后端 Agent 与 OpenClaw 运行时实例的双向映射
 */
@Entity('eco_openclaw_instances')
export class OpenClawInstanceEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Index()
  @Column({ name: 'agent_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  agentId?: number;

  @Index({ unique: true })
  @Column({ name: 'openclaw_agent_id', length: 64 })
  openclawAgentId: string;

  @Column({ length: 256, default: 'http://localhost:8080' })
  endpoint: string;

  @Column({
    type: 'enum',
    enum: ['online', 'offline', 'error'],
    default: 'offline',
  })
  status: 'online' | 'offline' | 'error';

  @Column({ name: 'last_heartbeat_at', type: 'datetime', nullable: true })
  lastHeartbeatAt?: Date;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;
}

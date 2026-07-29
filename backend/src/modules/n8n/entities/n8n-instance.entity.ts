import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * N8N 实例配置实体
 * 存储用户配置的 N8N 服务连接信息
 */
export type N8nInstanceStatus = 'pending' | 'running' | 'stopped' | 'error';

@Entity('n8n_instances')
export class N8nInstanceEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: number;

  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ name: 'base_url', length: 512 })
  baseUrl: string;

  @Column({ name: 'api_key', length: 256 })
  apiKey: string;

  @Column({ length: 32, default: 'pending' })
  status: N8nInstanceStatus;

  @Column({ length: 32, nullable: true })
  version?: string;

  @Column({ name: 'last_started_at', type: 'datetime', nullable: true })
  lastStartedAt?: Date;

  @Column({ name: 'last_stopped_at', type: 'datetime', nullable: true })
  lastStoppedAt?: Date;

  @Column({ name: 'webhook_url', length: 512, nullable: true })
  webhookUrl?: string;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;
}

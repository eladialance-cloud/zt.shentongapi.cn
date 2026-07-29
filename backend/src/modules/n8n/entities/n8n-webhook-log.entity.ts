import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

/**
 * N8N Webhook 回调日志实体
 * 记录每次 webhook 回调的验证结果与请求/响应数据
 */
@Entity('n8n_webhook_logs')
export class N8nWebhookLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index()
  @Column({ name: 'instance_id', type: 'bigint' })
  instanceId: number;

  @Index()
  @Column({ name: 'workflow_id', length: 64 })
  workflowId: string;

  @Column({ name: 'signature_valid', type: 'boolean', default: false })
  signatureValid: boolean;

  @Column({ name: 'signature_provided', type: 'boolean', default: false })
  signatureProvided: boolean;

  @Column({ type: 'json', nullable: true })
  payload?: Record<string, unknown>;

  @Column({ name: 'response_data', type: 'json', nullable: true })
  responseData?: Record<string, unknown>;

  @Column({ length: 32, default: 'processed' })
  status: string;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('chat_sessions')
export class ChatSessionEntity extends BaseEntity {
  @Column({ length: 128, default: '新会话' })
  title: string;

  @Index()
  @Column({ name: 'model_id', length: 64 })
  modelId: string;

  @Index()
  @Column({ name: 'agent_id', length: 64, nullable: true })
  agentId?: string;

  @Index()
  @Column({ name: 'group_id', type: 'bigint', default: 0 })
  groupId: number;

  @Column({ name: 'attached_knowledge_base_ids', type: 'json', nullable: true })
  attachedKnowledgeBaseIds?: number[];

  @Column({ name: 'enabled_plugin_ids', type: 'json', nullable: true })
  enabledPluginIds?: number[];

  @Column({ name: 'enabled_workflow_ids', type: 'json', nullable: true })
  enabledWorkflowIds?: number[];

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;
}

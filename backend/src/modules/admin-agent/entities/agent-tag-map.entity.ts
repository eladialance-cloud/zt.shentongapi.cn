import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Agent-标签关联实体
 */
@Entity('eco_agent_tag_map')
@Unique('uk_agent_tag', ['agentId', 'tagId'])
export class AgentTagMapEntity extends BaseEntity {
  /** Agent ID */
  @Index()
  @Column({ name: 'agent_id', type: 'bigint' })
  agentId: number;

  /** 标签 ID */
  @Index()
  @Column({ name: 'tag_id', type: 'bigint' })
  tagId: number;
}

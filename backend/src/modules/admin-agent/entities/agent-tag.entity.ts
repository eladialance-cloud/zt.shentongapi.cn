import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Agent 标签库实体
 */
@Entity('eco_agent_tag')
export class AgentTagEntity extends BaseEntity {
  /** 标签名称 */
  @Column({ length: 64 })
  name: string;

  /** 标签颜色 */
  @Column({ length: 32, nullable: true, default: '#6366f1' })
  color?: string;
}

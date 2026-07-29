import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * Agent 部门分类实体
 * 动态部门分类，替代 agents 表中固定的 category enum
 */
@Entity('agent_department')
export class AgentDepartmentEntity extends BaseEntity {
  /** 部门名称 */
  @Column({ length: 64 })
  name: string;

  /** 部门编码（如 office/programming/copywriting/data_analysis/other） */
  @Index({ unique: true })
  @Column({ length: 32 })
  code: string;

  /** 图标 URL */
  @Column({ length: 256, nullable: true })
  icon?: string;

  /** 排序 */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** 是否启用 */
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}

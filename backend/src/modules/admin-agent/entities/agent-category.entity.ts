import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Agent 分类元数据实体
 * 数据合同真源：Task 20 - Agent 市场管理
 *
 * 存储 5 个固定分类的显示名与排序：
 *   office / programming / copywriting / data_analysis / other
 * agents 表的 category 字段为 enum，本表仅维护显示元数据。
 */
@Entity('agent_categories')
export class AgentCategoryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index({ unique: true })
  @Column({ length: 64 })
  category: string;

  @Column({ name: 'display_name', length: 64 })
  displayName: string;

  @Column({ type: 'int', default: 0 })
  sort: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

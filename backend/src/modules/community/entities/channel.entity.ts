import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * 频道表
 * 数据合同真源：Community 模块 - 社区频道管理
 */
@Entity('channels')
export class ChannelEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ length: 64 })
  name: string;

  @Column({ length: 64, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 64, nullable: true })
  icon: string;

  @Column({ length: 7, default: '#4F6EF7' })
  color: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ name: 'post_count', type: 'int', default: 0 })
  postCount: number;

  @Column({ name: 'created_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}

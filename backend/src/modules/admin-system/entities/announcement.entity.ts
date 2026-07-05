import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 公告实体
 * 数据合同真源：Task 28 - 系统配置 / frontend types/admin-system Announcement
 *
 * 表名：announcements
 */
@Entity('announcements')
export class AnnouncementEntity extends BaseEntity {
  @Column({ length: 128 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'enum',
    enum: ['info', 'warning', 'critical'],
    default: 'info',
  })
  type: 'info' | 'warning' | 'critical';

  @Column({
    type: 'enum',
    enum: ['all', 'level_specific'],
    default: 'all',
  })
  scope: 'all' | 'level_specific';

  @Column({ name: 'target_level', type: 'int', nullable: true })
  targetLevel?: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Index()
  @Column({
    type: 'enum',
    enum: ['draft', 'published'],
    default: 'draft',
  })
  status: 'draft' | 'published';

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt?: Date;
}

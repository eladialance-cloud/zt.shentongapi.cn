import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 系统配置实体（通用 key-value，按 section 分区）
 * 数据合同真源：Task 28 - 系统配置 / frontend types/admin-system
 *
 * 表名：system_config
 * 用途：缓存/限流/通知等分区配置存储
 */
@Entity('system_config')
export class SystemConfigEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'section', length: 32 })
  section: string;

  @Column({ name: 'config_value', type: 'json' })
  configValue: Record<string, unknown>;

  @Column({ length: 256, nullable: true })
  description?: string;
}

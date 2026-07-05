import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export type ClientPlatform = 'win' | 'mac';

/**
 * 客户端版本实体
 * 数据合同真源：Task 27 - 客户端版本管理
 */
@Entity('client_versions')
export class ClientVersionEntity extends BaseEntity {
  @Index()
  @Column({ length: 32 })
  version: string;

  @Index()
  @Column({ length: 16 })
  platform: ClientPlatform;

  @Column({ name: 'download_url', length: 512 })
  downloadUrl: string;

  @Column({ type: 'text', nullable: true })
  changelog?: string;

  @Column({ name: 'force_update', type: 'boolean', default: false })
  forceUpdate: boolean;

  /** 灰度比例 0-100，100 表示全量发布 */
  @Column({ name: 'grayscale_percent', type: 'int', default: 100 })
  grayscalePercent: number;

  @Column({ name: 'published_at', type: 'datetime', nullable: true })
  publishedAt?: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}

import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 运行时引擎版本实体
 * 数据合同真源：深瞳AI_全栈部署方案_20260708.md 第 3.3 节
 */
@Entity('eco_runtime_versions')
@Index('idx_service_active', ['serviceName', 'isActive'])
export class RuntimeVersionEntity extends BaseEntity {
  @Index()
  @Column({ name: 'service_name', length: 32 })
  serviceName: string;

  @Column({ length: 32 })
  version: string;

  @Column({ length: 16 })
  platform: string;

  @Column({ name: 'download_url', length: 512 })
  downloadUrl: string;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ type: 'text', nullable: true })
  changelog?: string;

  @Index()
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'force_update', type: 'boolean', default: false })
  forceUpdate: boolean;

  @Column({ name: 'min_app_version', length: 32, nullable: true })
  minAppVersion?: string;
}

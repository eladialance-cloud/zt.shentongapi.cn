import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 系统OSS配置实体
 * 存储各云存储服务商的连接配置，支持 local/aliyun/tencent/qiniu/minio/aws。
 * access_key / secret_key 以 AES-256-GCM 加密存储（P0安全修复）。
 */
@Entity('sys_oss_config')
export class SysOssConfigEntity extends BaseEntity {
  @Column({ length: 64 })
  name: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['local', 'aliyun', 'tencent', 'qiniu', 'minio', 'aws'],
    default: 'local',
  })
  provider: 'local' | 'aliyun' | 'tencent' | 'qiniu' | 'minio' | 'aws';

  @Column({ length: 256, nullable: true })
  endpoint?: string;

  @Column({ length: 64, nullable: true })
  region?: string;

  @Column({ length: 128, nullable: true })
  bucket?: string;

  /** AES-256-GCM 加密后的 access_key */
  @Column({ name: 'access_key', length: 512, nullable: true })
  accessKey?: string;

  /** AES-256-GCM 加密后的 secret_key */
  @Column({ name: 'secret_key', length: 1024, nullable: true })
  secretKey?: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'extra_config', type: 'json', nullable: true })
  extraConfig?: Record<string, unknown>;
}

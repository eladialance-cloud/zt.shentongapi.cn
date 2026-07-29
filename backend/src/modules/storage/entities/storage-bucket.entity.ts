import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/**
 * 存储桶类型
 */
export type StorageBucketType = 'local' | 's3' | 'oss' | 'minio';

/**
 * 存储桶状态
 */
export type StorageBucketStatus = 'active' | 'error';

/**
 * 存储桶实体
 * 数据合同真源：Storage 模块设计
 */
@Entity('storage_buckets')
export class StorageBucketEntity extends BaseEntity {
  @Index('idx_storage_buckets_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ length: 128 })
  name: string;

  @Column({
    type: 'enum',
    enum: ['local', 's3', 'oss', 'minio'],
    default: 'local',
  })
  type: StorageBucketType;

  /** 存储配置（endpoint/bucket/region/accessKey/secretKey 等），AES 加密存储 */
  @Column({ type: 'json', nullable: true })
  config: Record<string, any> | null;

  /** 配额（字节） */
  @Column({
    name: 'quota_bytes',
    type: 'bigint',
    transformer: bigintTransformer,
    default: 5368709120, // 5GB
  })
  quotaBytes: number;

  /** 已用（字节） */
  @Column({
    name: 'used_bytes',
    type: 'bigint',
    transformer: bigintTransformer,
    default: 0,
  })
  usedBytes: number;

  @Column({
    type: 'enum',
    enum: ['active', 'error'],
    default: 'active',
  })
  status: StorageBucketStatus;
}

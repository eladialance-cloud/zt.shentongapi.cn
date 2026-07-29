import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/**
 * 存储对象实体
 * 数据合同真源：Storage 模块设计
 */
@Entity('storage_objects')
export class StorageObjectEntity extends BaseEntity {
  @Index('idx_storage_objects_bucket_id')
  @Column({ name: 'bucket_id', type: 'bigint', transformer: bigintTransformer })
  bucketId: number;

  @Index('idx_storage_objects_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Index('idx_storage_objects_file_key')
  @Column({ name: 'file_key', length: 256, unique: true })
  fileKey: string;

  @Column({ length: 256 })
  filename: string;

  @Column({ name: 'mime_type', length: 128, nullable: true })
  mimeType?: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  size: number;

  /** 实际存储路径（本地路径或远程 key） */
  @Column({ name: 'storage_path', length: 512 })
  storagePath: string;

  /** 访问 URL */
  @Column({ length: 1024, nullable: true })
  url?: string;

  /** 元数据 */
  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  /** 软删除时间 */
  @Column({ name: 'deleted_at', type: 'datetime', nullable: true })
  deletedAt: Date | null;
}

import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/** 素材来源类型 */
export type MediaAssetSourceType = 'task' | 'media_job' | 'manual';

/** 素材类型 */
export type MediaAssetType = 'image' | 'video' | 'audio' | 'file';

/**
 * 素材资产
 * 字段与 db-migration.ts 的 media_assets 表一致
 */
@Entity('media_assets')
export class MediaAssetEntity extends BaseEntity {
  @Index('idx_media_assets_user')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Index('idx_media_assets_source', ['sourceType', 'sourceId'])
  @Column({
    name: 'source_type',
    type: 'enum',
    enum: ['task', 'media_job', 'manual'],
    default: 'manual',
  })
  sourceType: MediaAssetSourceType;

  @Column({ name: 'source_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  sourceId?: number;

  @Column({ length: 255 })
  title: string;

  @Column({
    name: 'asset_type',
    type: 'enum',
    enum: ['image', 'video', 'audio', 'file'],
    default: 'file',
  })
  assetType: MediaAssetType;

  @Column({ length: 1024 })
  url: string;

  @Column({ name: 'mime_type', length: 128, nullable: true })
  mimeType?: string;

  @Column({ name: 'file_size', type: 'bigint', nullable: true, transformer: bigintTransformer })
  fileSize?: number;

  @Column({ type: 'json', nullable: true })
  tags?: string[] | null;

  @Column({ type: 'boolean', default: false })
  archived: boolean;
}
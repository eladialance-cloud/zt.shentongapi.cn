import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/** 素材来源类型 */
export type MediaAssetSourceType = 'task' | 'media_job' | 'manual';

/** 素材类型 */
export type MediaAssetType = 'image' | 'video' | 'audio' | 'file';

/** 素材业务类型：media=素材库常规素材；voice_asset=我的声音；ip_archive=IP 大脑档案 */
export type MediaAssetBizType = 'media' | 'voice_asset' | 'ip_archive';

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

  /** 素材描述（向量化检索文本：标题+标签+描述+meta 摘要） */
  @Column({ type: 'text', nullable: true })
  description?: string | null;

  /** 向量化状态 none|pending|ready|failed（Qdrant 语义索引） */
  @Column({ name: 'vector_status', length: 16, default: 'none' })
  vectorStatus: string;

  /** 扩展元数据（时长/分辨率/封面/字幕摘要等） */
  @Column({ type: 'json', nullable: true })
  meta?: Record<string, unknown> | null;

  /** 业务类型（P3 合并：voice_asset=我的声音 / ip_archive=IP 大脑档案，素材库常规素材为 media） */
  @Index('idx_media_assets_biz')
  @Column({ name: 'biz_type', length: 32, default: 'media' })
  bizType: MediaAssetBizType;

  @Column({ type: 'boolean', default: false })
  archived: boolean;
}
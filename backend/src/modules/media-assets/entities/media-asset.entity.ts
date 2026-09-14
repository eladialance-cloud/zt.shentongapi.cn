import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';
import type { MediaAssetKind, MediaAssetLibrary } from '../library-kind';

/** 素材来源类型（agent=官署任务产出；flow=业务流产出） */
export type MediaAssetSourceType = 'task' | 'media_job' | 'manual' | 'agent' | 'flow';

/** 素材类型 */
export type MediaAssetType = 'image' | 'video' | 'audio' | 'file';

/**
 * 素材业务类型（**过渡字段**，最终由 library+kind 取代）：
 * media=素材库常规素材；voice_asset=我的声音；ip_archive=IP 大脑档案；avatar=我的形象
 */
export type MediaAssetBizType = 'media' | 'voice_asset' | 'ip_archive' | 'avatar';

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
    // 与 db-migration 一致：原 ENUM('task','media_job','manual') 已放宽为 VARCHAR(32)，以容纳 agent/flow
    type: 'varchar',
    length: 32,
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

  /** 素材库归属：input=用户输入库（原料）；output=生成素材库（成品） */
  @Index('idx_media_assets_library')
  @Column({ name: 'library', length: 8, default: 'input' })
  library: MediaAssetLibrary;

  /** 业务类别，与 library 成对（见 library-kind.ts 的 LIBRARY_KINDS） */
  @Index('idx_media_assets_kind')
  @Column({ name: 'kind', length: 16, default: 'file' })
  kind: MediaAssetKind;

  /** 业务类型（P3 合并：voice_asset=我的声音 / ip_archive=IP 大脑档案，素材库常规素材为 media） */
  @Index('idx_media_assets_biz')
  @Column({ name: 'biz_type', length: 32, default: 'media' })
  bizType: MediaAssetBizType;

  @Column({ type: 'boolean', default: false })
  archived: boolean;
}
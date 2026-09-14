import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

/** 形象类型：cloud=火山数字人形象 ID / video=本地上传真人视频 / image=HeyGen talking photo 图片 / avatar=HeyGen 预置形象 */
export type MediaAssetAvatarKind = 'cloud' | 'video' | 'image' | 'avatar';

/**
 * 形象扩展表（1:1 扩展 media_assets）
 *
 * 素材两库合并（2026-09-14）：形象不再单独成表，主体落在
 * media_assets(library='input', kind='avatar', biz_type='avatar')，
 * 本表只保存形象特有的云侧字段（火山 digital_human_id / HeyGen 图片 URL / 授权状态）。
 * asset_id 主键即 media_assets.id（形象随素材一起删除，无独立生命周期）。
 */
@Entity('media_asset_avatar')
export class MediaAssetAvatarEntity {
  @PrimaryColumn({ name: 'asset_id', type: 'bigint', transformer: bigintTransformer })
  assetId: number;

  @Column({ name: 'dh_kind', length: 8, default: 'cloud' })
  dhKind: MediaAssetAvatarKind;

  /** 云侧形象 ID（kind=cloud 时必填，火山 digital_human_id） */
  @Column({ name: 'cloud_id', length: 128 })
  cloudId: string;

  /** 本地视频形象 URL（kind=video：转码后的 MP4 直链） */
  @Column({ name: 'video_url', type: 'varchar', length: 512, nullable: true })
  videoUrl?: string | null;

  /** HeyGen talking photo 图片 URL（kind=image，需公网 URL 供 HeyGen 拉取） */
  @Column({ name: 'image_url', type: 'varchar', length: 512, nullable: true })
  imageUrl?: string | null;

  /** 形象预览图/样片 URL（可选） */
  @Column({ name: 'preview_url', type: 'varchar', length: 512, nullable: true })
  previewUrl?: string | null;

  /** 形象授权状态（对标参考软件 digital_auth） */
  @Column({ default: true })
  authorized: boolean;

  @Column({ length: 16, default: 'ready' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

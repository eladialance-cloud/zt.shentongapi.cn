/**
 * @deprecated 已下线（2026-09-14 形象合并）——形象现由
 * media_assets(library='input', kind='avatar', biz_type='avatar') + media_asset_avatar 扩展表承载，
 * 见 media-assets/entities/media-asset-avatar.entity.ts。本文件仅作历史存档，勿新增引用；
 * 对应旧表已由启动迁移重命名为 digital_human_assets_archived。
 */
import { Entity, Column, Index, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

// PrimaryGeneratedColumnNumericOptions 类型不含 transformer 字段（同 base.entity.ts 的处理方式）
const dhAssetIdColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/** 我的数字人形象（对标参考软件"形象库/授权状态"；cloudId=火山形象 ID） */
@Entity('digital_human_assets')
export class DigitalHumanAssetEntity {
  @PrimaryGeneratedColumn(dhAssetIdColumnOptions)
  id: number;

  @Index('idx_dha_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ length: 128 })
  name: string;

  /** 形象类型（D2/M4+）：cloud=火山数字人形象 ID / video=本地上传真人视频 / image=HeyGen talking photo 图片 / avatar=HeyGen 预置形象 */
  @Column({ length: 8, default: 'cloud' })
  kind: 'cloud' | 'video' | 'image' | 'avatar';

  /** 火山数字人形象 ID（digital_human_id，kind=cloud 时必填） */
  @Column({ name: 'cloud_id', length: 128 })
  cloudId: string;

  /** 本地视频形象 URL（D2：kind=video 时使用，转码后的 MP4 公网/上传直链） */
  @Column({ name: 'video_url', type: 'varchar', length: 512, nullable: true })
  videoUrl?: string | null;

  /** HeyGen talking photo 图片 URL（M4+：kind=image 时使用，需公网 URL 供 HeyGen 拉取） */
  @Column({ name: 'image_url', type: 'varchar', length: 512, nullable: true })
  imageUrl?: string | null;

  /** 形象预览图/样片 URL（可选） */
  @Column({ name: 'preview_url', type: 'varchar', length: 512, nullable: true })
  previewUrl?: string | null;

  /** 形象授权状态（对标参考软件 digital_auth） */
  @Column({ default: true })
  authorized: boolean;

  /** 形象描述（D1：添加形象时可填） */
  @Column({ type: 'varchar', length: 512, nullable: true })
  description?: string | null;

  @Column({ length: 16, default: 'ready' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

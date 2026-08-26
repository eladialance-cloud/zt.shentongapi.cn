import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

const matIdColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/** 口播工坊素材库（P4：画中画/混剪/背景素材，对标参考软件"素材管理"） */
@Entity('oral_workshop_materials')
export class OralWorkshopMaterialEntity {
  @PrimaryGeneratedColumn(matIdColumnOptions)
  id: number;

  @Index('idx_owm_user')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  /** 素材名称 */
  @Column({ length: 128 })
  name: string;

  /** 素材类型：image / video / audio */
  @Column({ length: 16 })
  type: 'image' | 'video' | 'audio';

  /** 素材分类：uncategorized=未分类 / pip=画中画 / bgm=背景音乐 / cover=封面 / sticker=贴纸 */
  @Index('idx_owm_cat')
  @Column({ length: 32, default: 'uncategorized' })
  category: string;

  /** 素材 URL */
  @Column({ length: 512 })
  url: string;

  /** 缩略图/预览 URL（视频可为首帧） */
  @Column({ name: 'preview_url', type: 'varchar', length: 512, nullable: true })
  previewUrl?: string | null;

  /** 就绪状态：ready=就绪 / vector_pending=向量化中（AI 混剪匹配预留） */
  @Column({ length: 16, default: 'ready' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

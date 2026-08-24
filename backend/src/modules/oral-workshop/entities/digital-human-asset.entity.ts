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

  /** 火山数字人形象 ID（digital_human_id） */
  @Column({ name: 'cloud_id', length: 128 })
  cloudId: string;

  /** 形象预览图/样片 URL（可选） */
  @Column({ name: 'preview_url', length: 512, nullable: true })
  previewUrl?: string | null;

  /** 形象授权状态（对标参考软件 digital_auth） */
  @Column({ default: true })
  authorized: boolean;

  @Column({ length: 16, default: 'ready' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

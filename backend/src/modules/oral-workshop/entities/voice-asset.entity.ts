import { Entity, Column, Index, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

// PrimaryGeneratedColumnNumericOptions 类型不含 transformer 字段（同 base.entity.ts 的处理方式）
const voiceAssetIdColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/** 我的声音资产（对标参考软件"声音克隆/训练/预览"；参考音频 + 可选火山 speaker_id） */
@Entity('voice_assets')
export class VoiceAssetEntity {
  @PrimaryGeneratedColumn(voiceAssetIdColumnOptions)
  id: number;

  @Index('idx_va_user_id')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ length: 128 })
  name: string;

  /** 参考音频（OSS URL 或服务器路径），用于火山声音复刻 */
  @Column({ name: 'ref_audio_url', length: 512 })
  refAudioUrl: string;

  /** 火山 speaker_id（预克隆后可回填；任务时若为空则由执行器按参考音频克隆） */
  @Column({ name: 'speaker_id', type: 'varchar', length: 128, nullable: true })
  speakerId?: string | null;

  @Column({ length: 16, default: 'ready' })
  status: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

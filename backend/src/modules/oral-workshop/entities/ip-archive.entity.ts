import { Entity, Column, Index, CreateDateColumn, PrimaryGeneratedColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

// PrimaryGeneratedColumnNumericOptions 类型不含 transformer 字段（同 base.entity.ts 的处理方式）
const ipArchiveIdColumnOptions = {
  type: 'bigint' as const,
  name: 'id',
  transformer: bigintTransformer,
};

/** IP 大脑档案（对标 aigc-human ip-brain）：对标主页/合集/单视频解析结果存档 */
@Entity('ip_archives')
export class IpArchiveEntity {
  @PrimaryGeneratedColumn(ipArchiveIdColumnOptions)
  id: number;

  @Index('idx_ipa_user')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  /** 对标链接（主页/合集/单视频） */
  @Column({ length: 512 })
  url: string;

  /** 首个作品标题（兜底用链接） */
  @Column({ type: 'varchar', length: 255, nullable: true })
  title?: string | null;

  /** 风格分析（LLM 生成） */
  @Column({ name: 'style_analysis', type: 'text', nullable: true })
  styleAnalysis?: string | null;

  /** 选题列表（JSON 字符串） */
  @Column({ type: 'text', nullable: true })
  topics?: string | null;

  /** 作品元数据原始 JSON（yt-dlp 解析结果，最多 8 条） */
  @Column({ name: 'source_json', type: 'text', nullable: true })
  sourceJson?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

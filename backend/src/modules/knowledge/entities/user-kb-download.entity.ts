import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** 官方知识库下载记录（Phase 3 同步到本地用） */
@Entity('user_kb_downloads')
export class UserKbDownloadEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Index()
  @Column({ name: 'kb_id', type: 'bigint' })
  kbId: number;

  @Column({
    type: 'enum',
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'completed' | 'failed';
}

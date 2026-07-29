import { Entity, PrimaryColumn, Column } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

/**
 * 用户社区档案表
 * 数据合同真源：Community 模块 - 用户档案
 */
@Entity('user_profiles')
export class UserProfileEntity {
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ type: 'int', default: 0 })
  reputation: number;

  @Column({ type: 'int', default: 1 })
  level: number;

  @Column({ type: 'int', default: 0 })
  coins: number;

  @Column({ name: 'post_count', type: 'int', default: 0 })
  postCount: number;

  @Column({ name: 'reply_count', type: 'int', default: 0 })
  replyCount: number;

  @Column({ name: 'accepted_count', type: 'int', default: 0 })
  acceptedCount: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  bio: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  github: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  location: string;

  @Column({ name: 'updated_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}

import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

export enum VoteTargetType {
  POST = 'post',
  REPLY = 'reply',
}

/**
 * 投票表
 * 数据合同真源：Community 模块 - 投票/踩赞管理
 */
@Entity('social_votes')
@Index(['userId'])
@Unique(['userId', 'targetType', 'targetId'])
export class VoteEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ name: 'target_type', type: 'enum', enum: VoteTargetType })
  targetType: VoteTargetType;

  @Column({ name: 'target_id', type: 'bigint', transformer: bigintTransformer })
  targetId: number;

  @Column({ type: 'tinyint', default: 0 })
  value: number;
}

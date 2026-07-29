import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

export enum ReplyStatus {
  ACTIVE = 'active',
  DELETED = 'deleted',
}

/**
 * 回复表
 * 数据合同真源：Community 模块 - 回复管理
 */
@Entity('replies')
@Index(['postId'])
@Index(['authorId'])
@Index(['parentId'])
export class ReplyEntity extends BaseEntity {
  @Column({ name: 'post_id', type: 'bigint', transformer: bigintTransformer })
  postId: number;

  @Column({ name: 'author_id', type: 'bigint', transformer: bigintTransformer })
  authorId: number;

  @Column({ name: 'parent_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  parentId: number | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'content_html', type: 'text', nullable: true })
  contentHtml: string | null;

  @Column({ name: 'vote_count', type: 'int', default: 0 })
  voteCount: number;

  @Column({ name: 'is_accepted', type: 'boolean', default: false })
  isAccepted: boolean;

  @Column({ type: 'enum', enum: ReplyStatus, default: ReplyStatus.ACTIVE })
  status: ReplyStatus;
}

import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { bigintTransformer } from '../../../common/entities/base.entity';

export enum PostType {
  DISCUSSION = 'discussion',
  QUESTION = 'question',
  SHOWCASE = 'showcase',
  ANNOUNCEMENT = 'announcement',
}

export enum PostStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DELETED = 'deleted',
}

/**
 * 帖子表
 * 数据合同真源：Community 模块 - 帖子管理
 */
@Entity('posts')
@Index(['channelId'])
@Index(['authorId'])
@Index(['status'])
@Index(['isPinned', 'createdAt'])
@Index(['isEssence', 'voteCount'])
export class PostEntity extends BaseEntity {
  @Column({ name: 'channel_id', type: 'varchar', length: 32 })
  channelId: string;

  @Column({ name: 'author_id', type: 'bigint', transformer: bigintTransformer })
  authorId: number;

  @Column({ type: 'enum', enum: PostType, default: PostType.DISCUSSION })
  type: PostType;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'content_html', type: 'text', nullable: true })
  contentHtml: string | null;

  @Column({ name: 'is_resolved', type: 'boolean', default: false })
  isResolved: boolean;

  @Column({ name: 'best_reply_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  bestReplyId: number | null;

  @Column({ type: 'int', default: 0 })
  bounty: number;

  @Column({ name: 'cover_image', type: 'varchar', length: 500, nullable: true })
  coverImage: string | null;

  @Column({ name: 'demo_url', type: 'varchar', length: 500, nullable: true })
  demoUrl: string | null;

  @Column({ name: 'agent_id', type: 'varchar', length: 64, nullable: true })
  agentId: string | null;

  @Column({ name: 'view_count', type: 'int', default: 0 })
  viewCount: number;

  @Column({ name: 'vote_count', type: 'int', default: 0 })
  voteCount: number;

  @Column({ name: 'reply_count', type: 'int', default: 0 })
  replyCount: number;

  @Column({ name: 'bookmark_count', type: 'int', default: 0 })
  bookmarkCount: number;

  @Column({ type: 'enum', enum: PostStatus, default: PostStatus.APPROVED })
  status: PostStatus;

  @Column({ name: 'is_pinned', type: 'boolean', default: false })
  isPinned: boolean;

  @Column({ name: 'is_essence', type: 'boolean', default: false })
  isEssence: boolean;
}

import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

/**
 * 收藏表
 * 数据合同真源：Community 模块 - 收藏管理
 */
@Entity('social_bookmarks')
@Unique(['userId', 'postId'])
export class BookmarkEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Column({ name: 'post_id', type: 'bigint', transformer: bigintTransformer })
  postId: number;
}

import { Entity, PrimaryColumn } from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

/**
 * 帖子标签关联表
 * 数据合同真源：Community 模块 - 帖子标签关联
 */
@Entity('social_post_tags')
export class PostTagEntity {
  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  postId: number;

  @PrimaryColumn({ type: 'bigint', transformer: bigintTransformer })
  tagId: number;
}

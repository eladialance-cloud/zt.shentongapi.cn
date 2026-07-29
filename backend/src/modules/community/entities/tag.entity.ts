import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 标签表
 * 数据合同真源：Community 模块 - 标签管理
 */
@Entity('tags')
@Index(['postCount'])
export class TagEntity extends BaseEntity {
  @Column({ length: 64, unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 7, default: '#4F6EF7' })
  color: string;

  @Column({ name: 'post_count', type: 'int', default: 0 })
  postCount: number;
}

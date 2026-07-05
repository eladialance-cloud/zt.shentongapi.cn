import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 敏感词实体
 * 数据合同真源：Task 25 - 内容审核 / frontend types/admin-audit SensitiveWord
 *
 * 表名：sensitive_words
 */
@Entity('sensitive_words')
export class SensitiveWordEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 128 })
  word: string;

  @Column({
    type: 'enum',
    enum: ['politics', 'porn', 'violence', 'ad', 'other'],
    default: 'other',
  })
  category: 'politics' | 'porn' | 'violence' | 'ad' | 'other';

  @Column({
    type: 'enum',
    enum: ['block', 'replace', 'review'],
    default: 'review',
  })
  level: 'block' | 'replace' | 'review';

  @Column({ length: 128, nullable: true })
  replacement?: string;
}

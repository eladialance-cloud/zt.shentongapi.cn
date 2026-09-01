import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { bigintTransformer } from '../../../common/entities/base.entity';

/**
 * 技能包评分记录
 * 每个用户对每个技能包只能评一次分
 */
@Entity('create_hermes_skill_ratings')
@Unique('uk_user_skill', ['userId', 'skillId'])
export class HermesSkillRatingEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index('idx_hermes_rating_user')
  @Column({ name: 'user_id', type: 'bigint', transformer: bigintTransformer })
  userId: number;

  @Index('idx_hermes_rating_skill')
  @Column({ name: 'skill_id', type: 'bigint', transformer: bigintTransformer })
  skillId: number;

  /** 评分 1-5 */
  @Column({ type: 'int' })
  rating: number;

  /** 评论文本 */
  @Column({ type: 'text', nullable: true })
  comment?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

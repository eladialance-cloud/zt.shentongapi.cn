import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('chat_groups')
export class ChatGroupEntity extends BaseEntity {
  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ length: 128 })
  name: string;

  @Column({ name: 'order', type: 'int', default: 0 })
  order: number;
}

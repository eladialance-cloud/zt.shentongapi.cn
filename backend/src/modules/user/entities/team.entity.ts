import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('teams')
export class TeamEntity extends BaseEntity {
  @Column({ length: 128 })
  name: string;

  @Index()
  @Column({ name: 'owner_id', type: 'bigint' })
  ownerId: number;

  @Column({ length: 512, nullable: true })
  description?: string;
}

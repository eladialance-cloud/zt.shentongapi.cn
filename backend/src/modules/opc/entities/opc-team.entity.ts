import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('opc_teams')
export class OpcTeamEntity extends BaseEntity {
  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  avatar?: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ name: 'member_count', type: 'int', default: 0 })
  memberCount: number;

  @Index()
  @Column({ name: 'creator_id', type: 'bigint' })
  creatorId: number;
}

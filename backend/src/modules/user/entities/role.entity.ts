import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

@Entity('roles')
export class RoleEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 64 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  permissions?: string[] | Record<string, unknown>;
}

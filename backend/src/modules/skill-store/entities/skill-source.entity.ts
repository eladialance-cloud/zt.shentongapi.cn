import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

@Entity('skill_sources')
export class SkillSourceEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'source_url', length: 512 })
  sourceUrl: string;

  @Column({ name: 'source_type', length: 32, default: 'github' })
  sourceType: 'github' | 'npm' | 'zip' | 'url';

  @Column({ name: 'skill_name', length: 64 })
  skillName: string;

  @Column({ name: 'skill_desc', length: 512 })
  skillDesc: string;

  @Column({ name: 'skill_type', length: 32, default: 'skill' })
  skillType: 'skill' | 'workflow';

  @Column({ name: 'auto_detected_type', length: 32, nullable: true })
  autoDetectedType?: string;

  @Column({
    name: 'status',
    type: 'enum',
    enum: ['pending', 'analyzing', 'analyzed', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'analyzing' | 'analyzed' | 'failed';

  @Column({ name: 'analyze_result', type: 'json', nullable: true })
  analyzeResult?: Record<string, unknown>;

  @Column({ name: 'error_message', length: 1024, nullable: true })
  errorMessage?: string;

  @Column({ name: 'package_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  packageId?: number;
}

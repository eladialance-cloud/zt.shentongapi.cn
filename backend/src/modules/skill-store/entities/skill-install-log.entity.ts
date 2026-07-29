import { Entity, Column } from 'typeorm';
import { BaseEntity, bigintTransformer } from '../../../common/entities/base.entity';

@Entity('skill_install_logs')
export class SkillInstallLogEntity extends BaseEntity {
  @Column({ name: 'package_id', type: 'bigint', transformer: bigintTransformer })
  packageId: number;

  @Column({ name: 'user_id', type: 'bigint', nullable: true, transformer: bigintTransformer })
  userId?: number;

  @Column({ length: 32 })
  action: 'install' | 'analyze' | 'execute' | 'health_check';

  @Column({ length: 32, default: 'success' })
  result: 'success' | 'failed' | 'timeout';

  @Column({ name: 'error_message', length: 1024, nullable: true })
  errorMessage?: string;

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs: number;

  @Column({ type: 'json', nullable: true })
  detail?: Record<string, unknown>;
}

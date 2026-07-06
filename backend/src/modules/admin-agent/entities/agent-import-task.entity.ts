import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export interface ImportTaskStats {
  total: number;
  inserted: number;
  skipped: number;
  failed: number;
  durationMs: number;
  errors?: Array<{ filePath: string; error: string }>;
}

@Entity('agent_import_tasks')
export class AgentImportTaskEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'task_id', length: 64 })
  taskId: string;

  @Column({ name: 'repo_url', length: 512 })
  repoUrl: string;

  @Column({ length: 64, nullable: true })
  branch?: string;

  @Column({ name: 'commit_sha', length: 64, nullable: true })
  commitSha?: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'processing', 'success', 'failed'],
    default: 'pending',
  })
  status: 'pending' | 'processing' | 'success' | 'failed';

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ type: 'json', nullable: true })
  stats?: ImportTaskStats;

  @Column({ length: 512, nullable: true })
  error?: string;
}

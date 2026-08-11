import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { AssetImportType, ImportStepKey } from '../admin-imports.constants';

export type ImportJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface ImportStep {
  key: ImportStepKey;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export interface ImportJobResult {
  created: Array<{ type: AssetImportType; id: number; name: string }>;
  skipped: number;
}

@Entity('asset_import_jobs')
export class AssetImportJobEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  type: AssetImportType;

  @Column({ name: 'repo_url', length: 512 })
  repoUrl: string;

  @Column({ length: 128, nullable: true })
  branch?: string;

  @Column({ type: 'enum', enum: ['pending', 'processing', 'succeeded', 'failed'], default: 'pending' })
  status: ImportJobStatus;

  @Column({ type: 'json', nullable: true })
  steps?: ImportStep[];

  @Column({ type: 'json', nullable: true })
  result?: ImportJobResult;

  @Column({ name: 'error_message', length: 1024, nullable: true })
  errorMessage?: string;
}

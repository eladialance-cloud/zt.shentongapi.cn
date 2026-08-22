import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import type { AssetImportType, ImportStepKey } from '../admin-imports.constants';

export type ImportJobStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface ImportStep {
  key: ImportStepKey;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  /** 校验类步骤的实时进度（done/total），用于长时间导入的进度展示 */
  progress?: { done: number; total: number };
}

export interface ImportJobCatalogStats {
  /** 目录中解析到的技能条目总数 */
  totalEntries: number;
  /** 实际尝试展开的条目数（受 maxSkills 限制） */
  attempted: number;
  /** 成功取到 SKILL.md 并生成草稿的条目数 */
  fetched: number;
  /** 拉取失败 / 仓库无 SKILL.md 的条目数 */
  failed: number;
  /** 技能源保存模式：成功写入 skill_sources 的条目数 */
  saved?: number;
  /** 技能源保存模式：因 sourceUrl 重复被跳过的条目数 */
  skippedSources?: number;
}

export interface ImportJobResult {
  created: Array<{ type: AssetImportType; id: number; name: string }>;
  skipped: number;
  /** 技能目录仓库展开统计（仅目录类导入存在） */
  catalog?: ImportJobCatalogStats;
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

  /** 导入参数（如技能目录展开数量 maxSkills） */
  @Column({ type: 'json', nullable: true })
  params?: { maxSkills?: number };
}

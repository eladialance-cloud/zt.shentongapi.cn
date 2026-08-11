import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 技能包执行配置
 * 定义技能包如何被执行
 */
export interface SkillExecConfig {
  /** 执行类型 */
  type: 'shell' | 'api' | 'script' | 'workflow_ref';

  /** shell 类型：命令行（支持 {{input.xxx}} 模板变量） */
  command?: string;
  workingDir?: string;
  env?: Record<string, string>;

  /** api 类型 */
  url?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  bodyTemplate?: string;

  /** script 类型 */
  language?: 'javascript';
  code?: string;

  /** workflow_ref 类型 */
  n8nInstanceId?: number;
  workflowId?: string;

  /** 通用配置 */
  timeoutMs?: number;
  inputSchema?: Record<string, unknown>;
  outputMapping?: Record<string, string>;
}

/**
 * Hermes 技能包目录
 * 技能市场中的可用技能包，可挂载到 Hermes 实例上
 */
@Entity('hermes_skills')
export class HermesSkillEntity extends BaseEntity {
  @Column({ length: 128 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 64, nullable: true })
  author?: string;

  @Column({ name: 'price_per_minute', type: 'int', default: 0, comment: '积分/分钟，0=免费' })
  pricePerMinute: number;

  @Column({ name: 'install_count', type: 'int', default: 0 })
  installCount: number;

  @Column({ length: 512, nullable: true })
  icon?: string;

  @Column({ length: 64, default: '1.0.0' })
  version: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  /** 执行配置（JSON） */
  @Column({ name: 'exec_config', type: 'json', nullable: true })
  execConfig?: SkillExecConfig;

  /** 技能分类 */
  @Column({ length: 64, nullable: true })
  category?: string;

  /** 平均评分（0-5） */
  @Column({ name: 'avg_rating', type: 'decimal', precision: 3, scale: 2, default: 0 })
  avgRating: number;

  /** 评分数 */
  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount: number;

  /** 标签（JSON 数组） */
  @Column({ type: 'json', nullable: true })
  tags?: string[];
  /** 挂载的技能 ID 数组（skill_packages.id，设计文档 3.5） */
  @Column({ name: 'skill_ids', type: 'json', nullable: true })
  skillIds?: number[];

  @Column({ name: 'source_type', length: 16, default: 'manual' })
  sourceType: 'github' | 'manual';

  @Column({ name: 'source_repo', length: 512, nullable: true })
  sourceRepo?: string;

  @Column({ name: 'source_path', length: 512, nullable: true })
  sourcePath?: string;

  @Column({ name: 'github_topics', type: 'json', nullable: true })
  githubTopics?: string[];

  @Column({ type: 'json', nullable: true })
  pricing?: Record<string, unknown>;

  /** 更新日志 */
  @Column({ name: 'changelog', type: 'text', nullable: true })
  changelog?: string;

  /** 关联管理端技能包 ID（skill_packages.id），发布时同步生成 */
  @Index()
  @Column({ name: 'source_package_id', type: 'bigint', nullable: true })
  sourcePackageId?: number;
}

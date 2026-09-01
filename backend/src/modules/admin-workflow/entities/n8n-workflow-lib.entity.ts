import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 全局工作流库实体
 * 存储 N8N 工作流模板，支持 GitHub 导入
 */
@Entity('task_n8n_workflow_lib')
export class N8nWorkflowLibEntity extends BaseEntity {
  /** 工作流名称 */
  @Column({ length: 128 })
  name: string;

  /** 描述 */
  @Column({ type: 'text', nullable: true })
  description?: string;

  /** 分类: ai_collaboration / independent / automation */
  @Index()
  @Column({ length: 64, nullable: true })
  category?: string;

  /** N8N 工作流 JSON 定义 */
  @Column({ name: 'workflow_json', type: 'text', nullable: true })
  workflowJson?: string;

  /** GitHub 来源仓库 */
  @Column({ name: 'source_repo', length: 256, nullable: true })
  sourceRepo?: string;

  /** 来源文件路径 */
  @Column({ name: 'source_path', length: 512, nullable: true })
  sourcePath?: string;

  /** 版本号 */
  @Column({ length: 32, nullable: true })
  version?: string;

  /** 是否已发布 */
  @Column({ name: 'is_published', type: 'boolean', default: false })
  isPublished: boolean;

  /** 发布状态 */
  @Index()
  @Column({
    name: 'publish_status',
    type: 'enum',
    enum: ['draft', 'pending_review', 'approved', 'published', 'rejected'],
    default: 'draft',
  })
  publishStatus: 'draft' | 'pending_review' | 'approved' | 'published' | 'rejected';

  /** 图标 URL */
  @Column({ length: 256, nullable: true })
  icon?: string;

  /** 标签 */
  @Column({ type: 'json', nullable: true })
  tags?: string[];

  /** 参数表单定义（JSON Schema） */
  @Column({ name: 'input_schema', type: 'json', nullable: true })
  inputSchema?: Record<string, unknown>;
}

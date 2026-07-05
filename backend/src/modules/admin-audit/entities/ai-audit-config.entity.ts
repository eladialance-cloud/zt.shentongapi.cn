import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * AI 审核配置实体
 * 数据合同真源：Task 25 - 内容审核 / frontend types/admin-audit AuditConfig
 *
 * 采用单行配置（id=1）存储 JSON 配置，避免频繁建表。
 * 表名：ai_audit_config
 */
@Entity('ai_audit_config')
export class AiAuditConfigEntity extends BaseEntity {
  /** 配置内容（与前端 AuditConfig 结构对齐） */
  @Column({ type: 'json' })
  config: Record<string, unknown>;
}

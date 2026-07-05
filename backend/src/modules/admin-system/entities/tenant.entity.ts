import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 租户实体
 * 数据合同真源：Task 28 - 系统配置 / frontend types/admin-system Tenant
 *
 * 表名：tenants
 *
 * 说明：现有 modules/tenant 仅使用 TeamEntity（teams 表）做健康检查，
 * 缺少 quota/status 字段；为满足管理端 Tenant 契约，独立维护 tenants 表。
 */
@Entity('tenants')
export class TenantEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 128 })
  name: string;

  @Column({ type: 'json' })
  quota: {
    users: number;
    calls: number;
    storage: number;
  };

  @Index()
  @Column({
    type: 'enum',
    enum: ['active', 'suspended'],
    default: 'active',
  })
  status: 'active' | 'suspended';
}

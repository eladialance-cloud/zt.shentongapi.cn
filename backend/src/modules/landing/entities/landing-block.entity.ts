import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * Landing 页面区块实体
 * 数据合同真源：Landing 内容管理模块
 *
 * 说明：landing_blocks 表的 id 是 VARCHAR(32) 且非自增，
 * 因此不继承 BaseEntity，由调用方显式传入或业务生成。
 */
@Entity('landing_blocks')
export class LandingBlockEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ length: 64 })
  name: string;

  @Column({
    type: 'enum',
    enum: ['hero', 'stats', 'cards', 'steps', 'list', 'markdown'],
  })
  type: 'hero' | 'stats' | 'cards' | 'steps' | 'list' | 'markdown';

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_enabled', type: 'boolean', default: true })
  isEnabled: boolean;

  @Column({ type: 'json' })
  data: Record<string, any>;

  @Column({
    name: 'created_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt: Date;

  @Column({
    name: 'updated_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;
}

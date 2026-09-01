import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { PluginEntity } from './plugin.entity';

/**
 * 用户-插件关联实体
 * 记录用户安装的插件及其配置和状态
 */
@Entity('eco_user_plugins')
@Index('idx_user_plugin', ['userId', 'pluginId'], { unique: true })
export class UserPluginEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'plugin_id', type: 'int' })
  pluginId: number;

  @ManyToOne(() => PluginEntity)
  @JoinColumn({ name: 'plugin_id', referencedColumnName: 'id' })
  plugin: PluginEntity;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ name: 'is_installed', type: 'boolean', default: true })
  isInstalled: boolean;

  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;

  @Column({ name: 'installed_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  installedAt: Date;
}

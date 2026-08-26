import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/** 发布平台开关（管理后台配置；账号绑定在桌面端扫码完成） */
@Entity('oral_workshop_publish_platforms')
export class PublishPlatformEntity {
  @PrimaryGeneratedColumn()
  id: number;

  /** 平台 id：douyin / kuaishou / bilibili / xiaohongshu / xigua / wx_channels */
  @Column({ length: 32, unique: true })
  platform: string;

  /** 平台显示名：抖音/快手/小红书/B站/西瓜视频/蝴蝶号 */
  @Column({ name: 'display_name', length: 64 })
  displayName: string;

  /** 是否启用（管理后台开关） */
  @Column({ type: 'tinyint', width: 1, default: 1 })
  enabled: boolean;

  /** 排序 */
  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  /** 说明 */
  @Column({ type: 'varchar', length: 255, nullable: true })
  remark?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

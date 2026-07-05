import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 用户设备绑定实体
 * 数据合同真源：Task 4 - 设备指纹与绑定机制
 * 表 user_devices：每用户最多绑定 3 台设备（由业务层校验）
 */
@Entity('user_devices')
export class DeviceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId: number;

  @Column({ name: 'device_fingerprint', type: 'varchar', length: 64 })
  deviceFingerprint: string;

  @Column({ name: 'device_name', type: 'varchar', length: 128 })
  deviceName: string;

  @Column({ name: 'device_type', type: 'varchar', length: 32 })
  deviceType: string; // win32/darwin/linux

  @Column({ name: 'last_login_at', type: 'datetime' })
  lastLoginAt: Date;

  @Column({ name: 'last_login_ip', type: 'varchar', length: 64 })
  lastLoginIp: string;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'active' })
  status: string; // active/disabled

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * 操作日志实体
 * 数据合同真源：Task 17 - 管理端认证与权限（操作日志）
 *
 * 记录管理端写操作（POST/PUT/PATCH/DELETE），由 OperationLogInterceptor 自动写入。
 */
@Entity('operation_logs')
export class OperationLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'id' })
  id: number;

  @Index()
  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ length: 64 })
  username: string;

  @Index()
  @Column({ length: 64 })
  type: string;

  @Column({ length: 128 })
  target: string;

  @Column({ length: 512 })
  operation: string;

  @Column({ length: 64, nullable: true })
  ip?: string;

  @Column({ length: 512, nullable: true })
  ua?: string;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

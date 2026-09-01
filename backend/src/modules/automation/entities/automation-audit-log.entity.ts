import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn } from "typeorm";

/** 自动化工作台审计日志 — 自动化工作台方案 B6 */
@Entity("automation_audit_logs")
export class AutomationAuditLogEntity {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: number;

  @Index()
  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "command_id", length: 64, nullable: true })
  commandId?: string;

  @Column({ name: "instance_id", type: "bigint", nullable: true })
  instanceId?: number;

  /** in / result / confirm */
  @Column({ length: 16, default: "in" })
  direction: string;

  @Column({ length: 512, nullable: true })
  command?: string;

  @Column({ name: "command_type", length: 32, nullable: true })
  commandType?: string;

  /** received / routed / offline / need_confirmation / success / failed */
  @Column({ length: 32, nullable: true })
  status?: string;

  @Column({ length: 1024, nullable: true })
  message?: string;

  @Column({ name: "reply_context", type: "json", nullable: true })
  replyContext?: unknown;

  @Column({ name: "device_id", length: 128, nullable: true })
  deviceId?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from "typeorm";

/** 定时任务 — 对话创建，软件开着时由桌面端调度器触发，经 Hermes 编排执行团队任务 */
@Entity("scheduled_tasks")
export class ScheduledTaskEntity {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: number;

  @Index("idx_scheduled_tasks_user")
  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ type: "varchar", length: 255 })
  title: string;

  /** 触发时作为团队任务描述 / Hermes 任务输入 */
  @Column({ type: "text", nullable: true })
  description?: string | null;

  /** 执行团队 ID（NULL = 自动选用户第一个团队） */
  @Column({ name: "team_id", type: "bigint", nullable: true })
  teamId?: number | null;

  /** once | daily | weekly */
  @Column({ name: "repeat_type", type: "varchar", length: 16, default: "once" })
  repeatType: string;

  /** 每日/每周触发时间 HH:mm（24h） */
  @Column({ name: "run_time", type: "varchar", length: 8, nullable: true })
  runTime?: string | null;

  /** 每周触发星期（1=周一 … 7=周日） */
  @Column({ type: "tinyint", nullable: true })
  weekday?: number | null;

  /** 一次性任务的执行时间 */
  @Column({ name: "due_at", type: "datetime", nullable: true })
  dueAt?: Date | null;

  /** 下次触发时间（调度器按此轮询） */
  @Column({ name: "next_run_at", type: "datetime", nullable: true })
  nextRunAt?: Date | null;

  /** active | paused | done | failed */
  @Column({ type: "varchar", length: 16, default: "active" })
  status: string;

  /** 触发中令牌（防重复触发，桌面端 fire 时占位） */
  @Column({ name: "firing_token", type: "varchar", length: 64, nullable: true })
  firingToken?: string | null;

  /** 触发占位过期时间（崩溃兜底，10 分钟后可重新触发） */
  @Column({ name: "firing_expire_at", type: "datetime", nullable: true })
  firingExpireAt?: Date | null;

  @Column({ name: "last_run_at", type: "datetime", nullable: true })
  lastRunAt?: Date | null;

  @Column({ name: "last_error", type: "text", nullable: true })
  lastError?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

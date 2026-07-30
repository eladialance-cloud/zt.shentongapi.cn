import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index,
} from "typeorm";

/** 团队任务 — 替换 opc_tasks，新增 failed 状态 */
@Entity("team_tasks")
export class TeamTaskEntity {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: number;

  @Index("idx_team_task_team")
  @Column({ name: "team_id", type: "bigint" })
  teamId: number;

  @Column({ length: 128 })
  title: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({
    type: "enum",
    enum: ["pending", "in_progress", "completed", "failed"],
    default: "pending",
  })
  status: "pending" | "in_progress" | "completed" | "failed";

  /** 分配给哪个成员（team_member.id） */
  @Column({ name: "assignee_member_id", type: "bigint", nullable: true })
  assigneeMemberId?: number;

  @Column({ name: "creator_id", type: "bigint" })
  creatorId: number;

  @Column({
    type: "enum",
    enum: ["low", "medium", "high", "urgent"],
    default: "medium",
  })
  priority: "low" | "medium" | "high" | "urgent";

  @Column({ name: "due_date", type: "datetime", nullable: true })
  dueDate?: Date;

  @Column({ name: "result", type: "json", nullable: true })
  result?: unknown;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({ name: "completed_at", type: "datetime", nullable: true })
  completedAt?: Date;
}

import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index,
} from "typeorm";

/** 团队协作流程节点（按 sortOrder 排序；Hermes 编排时作为任务主干模板） */
@Entity("task_team_workflow_nodes")
export class TeamWorkflowNodeEntity {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: number;

  @Index("idx_team_workflow_team")
  @Column({ name: "team_id", type: "bigint" })
  teamId: number;

  /** 节点名，如「选题确认」 */
  @Column({ length: 128 })
  name: string;

  /** 节点说明 */
  @Column({ length: 512, nullable: true })
  description?: string;

  /** 节点顺序（升序） */
  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  /** 负责成员 ID（task_team_members.id）列表；空数组 = Hermes 自动指派 */
  @Column({ name: "assignee_member_ids", type: "json", nullable: true })
  assigneeMemberIds?: number[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}

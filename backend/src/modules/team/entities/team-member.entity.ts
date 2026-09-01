import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index,
} from "typeorm";

/** 团队成员 — 核心变化：绑定 Agent + 自定义职能 */
@Entity("task_team_members")
@Index("uniq_team_member_agent", ["teamId", "agentId"], { unique: true })
export class TeamMemberEntity {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: number;

  @Index("idx_team_member_team")
  @Column({ name: "team_id", type: "bigint" })
  teamId: number;

  /** 关联的 Agent ID */
  @Index("idx_team_member_agent")
  @Column({ name: "agent_id", type: "bigint" })
  agentId: number;

  /** Agent 名称快照（冗余，方便展示） */
  @Column({ name: "agent_name", length: 64 })
  agentName: string;

  /** Agent 头像快照 */
  @Column({ name: "agent_avatar", length: 512, nullable: true })
  agentAvatar?: string;

  /** 自定义职能名，如 CEO/渠道总监/销售经理 */
  @Column({ name: "role_title", length: 64 })
  roleTitle: string;

  /** 职能描述 */
  @Column({ name: "role_description", length: 512, nullable: true })
  roleDescription?: string;

  /** 职能图标 emoji */
  @Column({ name: "role_emoji", length: 16, nullable: true })
  roleEmoji?: string;

  /** 主题色（用于 Office 工位区分） */
  @Column({ name: "theme_color", length: 16, nullable: true })
  themeColor?: string;

  /** 成员排序（Office 工位顺序） */
  @Column({ name: "sort_order", type: "int", default: 0 })
  sortOrder: number;

  /** 是否激活 */
  @Column({ name: "is_active", type: "boolean", default: true })
  isActive: boolean;

  @Column({ name: "added_by", type: "bigint" })
  addedBy: number;

  @CreateDateColumn({ name: "joined_at" })
  joinedAt: Date;
}

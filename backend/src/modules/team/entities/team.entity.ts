import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "../../../common/entities/base.entity";

/** 团队 — 替换 opc_teams */
@Entity("task_teams")
export class TeamEntity extends BaseEntity {
  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  avatar?: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ name: "member_count", type: "int", default: 0 })
  memberCount: number;

  /** 关联的知识库 ID（可选） */
  @Column({ name: "knowledge_base_id", type: "bigint", nullable: true })
  knowledgeBaseId?: number;

  @Index()
  @Column({ name: "creator_id", type: "bigint" })
  creatorId: number;
}

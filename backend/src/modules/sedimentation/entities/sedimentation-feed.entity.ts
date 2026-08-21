import {
  Entity, Column, PrimaryGeneratedColumn,
  CreateDateColumn, Index,
} from "typeorm";

/** 对话沉淀记录 — 记录每次自动沉淀，支持撤回 */
@Entity("sedimentation_feed")
export class SedimentationFeedEntity {
  @PrimaryGeneratedColumn({ type: "bigint", name: "id" })
  id: number;

  @Index("idx_sedimentation_user")
  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Column({ name: "session_id", type: "bigint", nullable: true })
  sessionId?: number | null;

  /** enterprise_doc | customer_profile | data_update */
  @Column({ type: "varchar", length: 32 })
  type: string;

  /** knowledge_base | hermes_memory */
  @Column({ type: "varchar", length: 32 })
  target: string;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text" })
  content: string;

  @Column({ name: "kb_id", type: "bigint", nullable: true })
  kbId?: number | null;

  @Column({ name: "doc_id", type: "bigint", nullable: true })
  docId?: number | null;

  /** applied | undone */
  @Column({ type: "varchar", length: 16, default: "applied" })
  status: string;

  @Column({ name: "undo_token", type: "varchar", length: 64, nullable: true })
  undoToken?: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
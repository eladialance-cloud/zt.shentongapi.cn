import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";

/** 自动化安全策略（A2 管理后台：高危操作白名单/敏感域名黑名单，键值对存储） */
@Entity("automation_policies")
export class AutomationPolicyEntity {
  @PrimaryGeneratedColumn({ type: "bigint", unsigned: true })
  id: number;

  @Column({ name: "policy_key", length: 64, unique: true })
  policyKey: string;

  /** 策略内容（数组或对象） */
  @Column({ name: "policy_value", type: "json" })
  policyValue: unknown;

  @Column({ length: 512, nullable: true })
  description?: string;

  @Column({ name: "updated_by", type: "bigint", nullable: true })
  updatedBy?: number | null;

  @Column({ name: "updated_at", type: "datetime", default: () => "CURRENT_TIMESTAMP", onUpdate: "CURRENT_TIMESTAMP" })
  updatedAt?: Date;
}
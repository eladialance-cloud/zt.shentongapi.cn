import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "../../../common/entities/base.entity";

/** 用户自动化场景实例（选模板填参数，IM 命中即路由执行）— 自动化工作台方案 B4 */
@Entity("automation_instances")
export class AutomationInstanceEntity extends BaseEntity {
  @Index()
  @Column({ name: "user_id", type: "bigint" })
  userId: number;

  @Index()
  @Column({ name: "template_id", type: "bigint" })
  templateId: number;

  /** 实例名称（IM 消息命中关键词） */
  @Column({ length: 128 })
  name: string;

  /** 用户填写的参数 */
  @Column({ name: "params_json", type: "json", nullable: true })
  params?: Record<string, unknown>;

  @Column({ type: "tinyint", default: 1 })
  enabled: number;

  /** 绑定设备指纹（留空=任意在线设备） */
  @Column({ name: "device_id", length: 128, nullable: true })
  deviceId?: string;

  @Column({ name: "last_run_at", type: "datetime", nullable: true })
  lastRunAt?: Date;
}
import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "../../../common/entities/base.entity";

/** 自动化场景模板（后台/内置预置）— 自动化工作台方案 B4 */
@Entity("automation_templates")
export class AutomationTemplateEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ length: 128 })
  name: string;

  @Column({ length: 512, nullable: true })
  description?: string;

  /** 执行步骤数组 [{type,name,paths/command/path/workflowId,params}] */
  @Column({ name: "steps_json", type: "json" })
  stepsJson: Array<Record<string, unknown>>;

  /** 参数 schema（表单/IM 填充） */
  @Column({ name: "params_schema", type: "json", nullable: true })
  paramsSchema?: Array<Record<string, unknown>>;

  /** IM 触发关键词（逗号分隔） */
  @Column({ length: 512, nullable: true })
  keywords?: string;

  @Column({ length: 16, default: "active" })
  status: string;

  @Column({ name: "built_in", type: "tinyint", default: 0 })
  builtIn: number;
}
import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/**
 * 工作流-MCP资源映射实体
 * 将工作流暴露为 MCP 资源，或绑定 MCP 资源作为输入/触发器
 */
@Entity('workflow_mcp_bind')
@Unique('uk_workflow_resource', ['workflowLibId', 'mcpResourceId'])
export class WorkflowMcpBindEntity extends BaseEntity {
  /** 工作流库 ID */
  @Index()
  @Column({ name: 'workflow_lib_id', type: 'bigint' })
  workflowLibId: number;

  /** MCP 资源 ID */
  @Column({ name: 'mcp_resource_id', type: 'bigint' })
  mcpResourceId: number;

  /** 绑定类型: input（输入）/ output（输出）/ trigger（触发器） */
  @Column({
    name: 'bind_type',
    type: 'enum',
    enum: ['input', 'output', 'trigger'],
    default: 'input',
  })
  bindType: 'input' | 'output' | 'trigger';

  /** 配置 */
  @Column({ type: 'json', nullable: true })
  config?: Record<string, unknown>;
}

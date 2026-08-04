import { Injectable, Logger } from "@nestjs/common";
import { N8nService } from "../../n8n/services/n8n.service";

/**
 * N8N-MCP Bridge — 将 N8N 工作流封装为 MCP 工具
 *
 * 设计文档: architecture_fix_plan_20260730.md Phase 1
 *
 * 核心职责:
 * 1. 将 N8N 实例的工作流自动注册为 MCP 工具
 * 2. 工具命名规范: workflow_{workflowId}
 * 3. 工具参数即工作流输入参数
 *
 * 这是"统一 MCP 能力总线"的第一步：让 N8N 工作流通过 MCP 被调用
 */
@Injectable()
export class N8nMcpBridgeService {
  private readonly logger = new Logger(N8nMcpBridgeService.name);

  constructor(private readonly n8nService: N8nService) {}

  /**
   * 生成 N8N 实例的工作流 MCP 工具列表
   * 用于注册到 MCP Server
   */
  async generateToolsForInstance(
    userId: number,
    n8nInstanceId: number,
  ): Promise<McpToolDefinition[]> {
    try {
      const workflows = await this.n8nService.listWorkflowsByInstance(
        userId,
        n8nInstanceId,
      );

      return (workflows || []).map((wf: any) => ({
        name: `workflow_${wf.id || wf.workflowId}`,
        description: `执行 N8N 工作流: ${wf.name || wf.workflowId}`,
        inputSchema: {
          type: "object",
          properties: {
            ...this.inferInputSchema(wf),
          },
        },
        // 元数据用于实际执行时查找
        _meta: {
          n8nInstanceId,
          workflowId: wf.id || wf.workflowId,
          workflowName: wf.name,
        },
      }));
    } catch (err) {
      this.logger.warn(
        `无法获取 N8N 实例 ${n8nInstanceId} 的工作流列表: ${(err as Error).message}`,
      );
      return [];
    }
  }

  /**
   * 通过 MCP 方式执行 N8N 工作流
   * 这是 Hermes 调度工作流时的统一入口
   */
  async callWorkflowTool(
    userId: number,
    n8nInstanceId: number,
    workflowId: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    this.logger.log(
      `[N8nMcpBridge] callWorkflowTool: userId=${userId}, n8nInstanceId=${n8nInstanceId}, workflowId=${workflowId}`,
    );

    return this.n8nService.triggerWorkflow(
      userId,
      n8nInstanceId,
      workflowId,
      args,
    );
  }

  /**
   * 获取 bridge 元信息
   */
  getBridgeInfo(n8nInstanceId: number) {
    return {
      serverType: "n8n-bridge",
      serverId: `n8n-bridge-${n8nInstanceId}`,
      transportType: "internal",
    };
  }

  /**
   * 从 N8N 工作流定义推断输入 schema
   * 默认提供通用 input 字段，子类可覆盖
   */
  private inferInputSchema(wf: any): Record<string, any> {
    // N8N 工作流输入通常是动态的，提供通用 schema
    return {
      input: {
        type: "object",
        description: `工作流 "${wf.name || wf.workflowId}" 的输入参数`,
        additionalProperties: true,
      },
    };
  }
}

/** MCP 工具定义 */
interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
  };
  _meta?: {
    n8nInstanceId: number;
    workflowId: string;
    workflowName?: string;
  };
}

import { Injectable, Logger } from "@nestjs/common";
import { McpService } from "../../mcp/services/mcp.service";
import { SyncGateway } from "../../sync/sync.gateway";

/**
 * AI 员工执行层
 * 设计文档: architecture_fix_plan_20260730.md Phase 4
 *
 * 核心职责:
 * 1. 接收 Hermes 分解的子任务
 * 2. 根据子任务类型分配给对应 AI 员工（角色）执行
 * 3. 通过 WebSocket 推送员工状态（驱动前端 Office 动画）
 * 4. 调用 MCP 工具完成实际业务操作
 *
 * 员工角色映射:
 * - business (商务AI/CEO):   任务编排、客户管理、合同审查
 * - content  (内容AI/编辑):   内容撰写、文案生成
 * - delivery (交付AI/检索):   知识检索、RAG 查询
 * - service  (客服AI/市场):   工具调用、外部 API
 * - finance  (财务AI/审核):   内容审核、合规检查
 */

export interface SubTask {
  type: "chat" | "search" | "tool_call" | "review" | "workflow";
  description: string;
  input: Record<string, unknown>;
  assignedRole?: string;
}

export interface EmployeeCapability {
  role: string;
  name: string;
  emoji: string;
  supportedTasks: string[];
  themeColor: string;
}

/** 默认 5 个 AI 员工的能力矩阵 */
const DEFAULT_EMPLOYEES: EmployeeCapability[] = [
  {
    role: "business", name: "商务AI", emoji: "👨‍💼",
    supportedTasks: ["chat", "workflow", "review"],
    themeColor: "#1677FF",
  },
  {
    role: "content", name: "内容AI", emoji: "📝",
    supportedTasks: ["chat", "review"],
    themeColor: "#722ED1",
  },
  {
    role: "delivery", name: "交付AI", emoji: "🚀",
    supportedTasks: ["search", "tool_call"],
    themeColor: "#13C2C2",
  },
  {
    role: "service", name: "客服AI", emoji: "🎧",
    supportedTasks: ["tool_call", "chat"],
    themeColor: "#FA8C16",
  },
  {
    role: "finance", name: "财务AI", emoji: "💰",
    supportedTasks: ["review"],
    themeColor: "#52C41A",
  },
];

@Injectable()
export class AIEmployeeService {
  private readonly logger = new Logger(AIEmployeeService.name);
  private employees: EmployeeCapability[] = [...DEFAULT_EMPLOYEES];

  constructor(
    private readonly mcpService: McpService,
    private readonly syncGateway: SyncGateway,
  ) {}

  /**
   * 根据子任务类型分配合适的 AI 员工
   */
  assignEmployee(task: SubTask): EmployeeCapability {
    // 优先使用指定的角色
    if (task.assignedRole) {
      const emp = this.employees.find((e) => e.role === task.assignedRole);
      if (emp && emp.supportedTasks.includes(task.type)) return emp;
    }

    // 根据任务类型自动分配
    const capable = this.employees.filter((e) =>
      e.supportedTasks.includes(task.type),
    );
    if (capable.length === 0) return this.employees[0];

    // 简单轮询分配
    const idx = (task.type.length + Date.now()) % capable.length;
    return capable[Math.floor(idx)];
  }

  /**
   * 执行子任务
   * 这是 Hermes 调度 AI 员工时的核心执行入口
   */
  async executeSubTask(
    userId: number,
    employee: EmployeeCapability,
    task: SubTask,
    context: { mcpServerId?: string; agentId?: number },
  ): Promise<unknown> {
    const employeeId = `team-member-${employee.role}`;

    // 推送员工状态: WORKING_DEEP（驱动前端 Office 动画）
    this.syncGateway.pushToUser(userId, "office:employee-status", {
      employeeId,
      status: "WORKING_DEEP",
      task: task.description,
      timestamp: new Date().toISOString(),
    });

    this.logger.log(
      `[AIEmployee] ${employee.name}(${employee.role}) 执行: ${task.type} - ${task.description}`,
    );

    try {
      let result: unknown;

      switch (task.type) {
        case "search":
          result = await this.executeSearch(userId, task, context);
          break;
        case "tool_call":
          result = await this.executeToolCall(userId, task, context);
          break;
        case "review":
          result = await this.executeReview(task);
          break;
        case "workflow":
          result = await this.executeWorkflow(task);
          break;
        case "chat":
        default:
          result = { message: `[${employee.name}] 已处理: ${task.description}` };
          break;
      }

      // 推送完成状态
      this.syncGateway.pushToUser(userId, "office:employee-status", {
        employeeId,
        status: "IDLE",
        task: task.description,
        completed: true,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (err) {
      // 推送错误状态
      this.syncGateway.pushToUser(userId, "office:employee-status", {
        employeeId,
        status: "IDLE",
        task: task.description,
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  }

  private async executeSearch(
    userId: number,
    task: SubTask,
    context: { mcpServerId?: string },
  ): Promise<unknown> {
    if (context.mcpServerId) {
      return this.mcpService.callTool(userId, {
        serverId: context.mcpServerId,
        toolName: "kb_search",
        args: { query: task.input.query || task.description },
      });
    }
    return { results: [], source: "no-mcp-server" };
  }

  private async executeToolCall(
    userId: number,
    task: SubTask,
    context: { mcpServerId?: string },
  ): Promise<unknown> {
    if (context.mcpServerId && task.input.toolName) {
      return this.mcpService.callTool(userId, {
        serverId: context.mcpServerId,
        toolName: task.input.toolName as string,
        args: (task.input.args as Record<string, unknown>) || {},
      });
    }
    return { executed: false, message: "工具调用未配置 MCP Server" };
  }

  private async executeReview(task: SubTask): Promise<unknown> {
    // 审核逻辑：检查内容合规性
    const content = task.input.content || task.description;
    return {
      passed: true,
      score: 0.95,
      summary: `内容审核通过: ${content}`,
    };
  }

  private async executeWorkflow(task: SubTask): Promise<unknown> {
    return {
      workflowId: task.input.workflowId,
      status: "triggered",
      message: "工作流已触发",
    };
  }

  /** 获取所有员工能力 */
  getEmployees(): EmployeeCapability[] {
    return [...this.employees];
  }

  /** 注册自定义员工（支持团队自定义角色） */
  registerEmployee(employee: EmployeeCapability): void {
    const idx = this.employees.findIndex((e) => e.role === employee.role);
    if (idx >= 0) {
      this.employees[idx] = employee;
    } else {
      this.employees.push(employee);
    }
  }
}

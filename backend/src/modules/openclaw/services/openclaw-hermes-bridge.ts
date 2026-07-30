import { Injectable, Logger } from "@nestjs/common";

/**
 * OpenClaw-Hermes 路由桥接
 * 设计文档: architecture_fix_plan_20260730.md Phase 3
 *
 * 核心职责:
 * 将 OpenClaw 的任务提交路由到 Hermes 决策中枢，
 * 使 OpenClaw 作为唯一入口网关，Hermes 作为决策大脑
 *
 * 调用链: 用户 → OpenClaw(入口) → Hermes(编排) → AI员工(执行) → MCP(能力)
 */
@Injectable()
export class OpenClawHermesBridge {
  private readonly logger = new Logger(OpenClawHermesBridge.name);

  /**
   * 将 OpenClaw 的调用结果路由到 Hermes 进行任务编排
   *
   * 当前阶段: OpenClaw 本地推理后，将结构化任务计划提交给 Hermes 执行
   * 后续阶段: OpenClaw 直接调用此桥接进行路由分发
   */
  async routeOpenClawTask(
    userId: number,
    openclawResponse: {
      taskPlan?: Array<{
        type: "agent_invoke" | "workflow_run" | "tool_call" | "skill_execute";
        target: string;
        input: Record<string, unknown>;
      }>;
      directResponse?: string;
    },
    hermesOrchestrate: (
      userId: number,
      instanceId: number,
      dto: { message: string; history?: Array<{ role: string; content: string }> },
    ) => Promise<{ taskId: string; result: unknown }>,
  ): Promise<{
    routed: boolean;
    results?: unknown[];
    directResponse?: string;
  }> {
    if (openclawResponse.directResponse && !openclawResponse.taskPlan) {
      this.logger.log("[OpenClawBridge] 直接响应模式，无需路由");
      return { routed: false, directResponse: openclawResponse.directResponse };
    }

    if (!openclawResponse.taskPlan || openclawResponse.taskPlan.length === 0) {
      return { routed: false, directResponse: openclawResponse.directResponse };
    }

    this.logger.log(
      `[OpenClawBridge] 路由 ${openclawResponse.taskPlan.length} 个子任务到 Hermes`,
    );

    // 将任务计划提交给 Hermes 编排执行
    const results: unknown[] = [];
    for (const subTask of openclawResponse.taskPlan) {
      try {
        const result = await hermesOrchestrate(userId, 1, {
          message: JSON.stringify(subTask),
        });
        results.push(result);
      } catch (err) {
        this.logger.error(`子任务执行失败: ${(err as Error).message}`);
        results.push({ error: (err as Error).message });
      }
    }

    return { routed: true, results };
  }
}

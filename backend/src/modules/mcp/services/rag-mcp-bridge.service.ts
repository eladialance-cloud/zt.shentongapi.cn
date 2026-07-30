import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";

/**
 * RAG-MCP Bridge — 将知识库检索封装为 MCP 工具
 *
 * 设计文档: architecture_fix_plan_20260730.md Phase 5
 *
 * 核心职责:
 * 将 RAG 知识库检索能力统一封装为 MCP 工具，
 * 使 AI 员工和 Agent 可以通过 MCP 统一总线调用知识库
 *
 * 工具列表:
 * - kb_search: 知识库语义检索
 * - kb_list_knowledge_bases: 列出可用知识库
 */
@Injectable()
export class RagMcpBridgeService {
  private readonly logger = new Logger(RagMcpBridgeService.name);
  private ragService: any = null;

  constructor() {}

  /**
   * 延迟注入 RagService（避免循环依赖）
   */
  setRagService(service: any): void {
    this.ragService = service;
    this.logger.log("[RagMcpBridge] RagService 已注入");
  }

  /**
   * 生成 RAG 相关的 MCP 工具定义
   */
  generateTools(): McpToolDefinition[] {
    return [
      {
        name: "kb_search",
        description: "在知识库中执行语义检索，返回最相关的文档片段",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "检索查询文本",
            },
            knowledgeBaseId: {
              type: "number",
              description: "知识库 ID（可选，不传则搜索所有知识库）",
            },
            topK: {
              type: "number",
              description: "返回结果数量，默认 5",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "kb_list_knowledge_bases",
        description: "列出当前用户可用的所有知识库",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ];
  }

  /**
   * 执行知识库检索
   */
  async search(
    userId: number,
    query: string,
    knowledgeBaseId?: number,
    topK?: number,
  ): Promise<unknown> {
    this.logger.log(
      `[RagMcpBridge] search: userId=${userId}, query="${query.substring(0, 50)}...", kbId=${knowledgeBaseId || "all"}, topK=${topK || 5}`,
    );

    if (this.ragService) {
      try {
        return await this.ragService.search(userId, query, {
          knowledgeBaseId,
          topK: topK || 5,
        });
      } catch (err) {
        this.logger.error(`[RagMcpBridge] RAG 检索失败: ${(err as Error).message}`);
        return { results: [], totalHits: 0, error: (err as Error).message };
      }
    }

    return {
      results: [],
      totalHits: 0,
      queryTime: 0,
      message: "RAG 服务尚未注入，请确保 RagModule 已正确配置。",
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
    required?: string[];
  };
}

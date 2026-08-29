// 工作流模块 API
//
// 端点契约：
//   GET    /workflows/templates               工作流模板列表（支持 category / keyword）
//   GET    /workflows/templates/:id           工作流模板详情
//   POST   /workflows/:id/execute             执行工作流（body: { input }）
//   GET    /workflows/executions              执行历史列表（支持 workflowId）

import { httpClient } from "./http-client";
import type {
  WorkflowTemplate,
  WorkflowExecution,
  WorkflowTemplateQuery,
  WorkflowExecutionQuery,
  PaginatedResult,
} from "@/types/workflow";

/**
 * 工作流模板列表
 * GET /workflows/templates?category=&keyword=
 */
export async function listTemplates(
  query: WorkflowTemplateQuery = {},
): Promise<PaginatedResult<WorkflowTemplate>> {
  return httpClient.get<PaginatedResult<WorkflowTemplate>>(
    "/workflows/templates",
    {
      params: query,
    },
  );
}

/**
 * 工作流模板详情
 * GET /workflows/templates/:id
 */
export async function getTemplate(id: number): Promise<WorkflowTemplate> {
  return httpClient.get<WorkflowTemplate>(`/workflows/templates/${id}`);
}

/**
 * 执行工作流
 * POST /workflows/:id/execute
 *
 * 后端在执行前会扣减 pricePerExecution 积分。
 *
 * @param id 工作流模板 ID
 * @param input 执行输入参数
 */
/** 创建工作流执行记录（返回云端执行记录 ID，桌面端随后本地真执行并回传结果） */
export async function executeWorkflow(
  id: number,
  input: unknown,
): Promise<{ executionId: number; status: string }> {
  return httpClient.post<{ executionId: number; status: string }>(`/workflows/${id}/execute`, {
    input,
  });
}

/** 工作流执行结果回传（桌面端本地 N8N 跑完后上报） */
export async function reportWorkflowExecution(
  executionId: number,
  dto: {
    status: "running" | "success" | "failed" | "cancelled";
    output?: unknown;
    error?: string;
    n8nExecutionId?: string;
    durationMs?: number;
  },
): Promise<unknown> {
  return httpClient.post(`/workflows/executions/${executionId}/report`, dto);
}

/**
 * 工作流执行历史
 * GET /workflows/executions?workflowId=
 */
export async function listExecutions(
  query: WorkflowExecutionQuery = {},
): Promise<PaginatedResult<WorkflowExecution>> {
  return httpClient.get<PaginatedResult<WorkflowExecution>>(
    "/workflows/executions",
    {
      params: query,
    },
  );
}

export default {
  listTemplates,
  getTemplate,
  executeWorkflow,
  listExecutions,
};

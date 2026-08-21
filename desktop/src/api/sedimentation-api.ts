// 对话知识沉淀 API（后端 sedimentation 模块）
//   POST /sedimentation/analyze   识别（LLM 分类）
//   POST /sedimentation/apply     应用沉淀（写知识库 + 记录）
//   POST /sedimentation/undo      按令牌撤回
import { httpClient } from "./http-client";

export type SedimentType = "enterprise_doc" | "customer_profile" | "data_update";
export type SedimentTarget = "knowledge_base" | "hermes_memory";

export interface AnalyzeResult {
  type: "enterprise_doc" | "customer_profile" | "requirement" | "data_update" | "none";
  target: SedimentTarget | "requirement_draft" | "customer_profile" | null;
  title: string;
  content: string;
  confidence: number;
  operation?: "add" | "replace" | "remove";
}

export interface ApplyResult {
  feedId: number;
  undoToken?: string;
  kbId?: number;
  docId?: number;
  /** 幂等命中（24h 内同标题同内容已沉淀），未重复写入 */
  alreadyExisted?: boolean;
}

export interface AnalyzeDto {
  content: string;
  history?: string[];
  /** 识别模型（缺省后端走用户 chat 默认模型） */
  model?: string;
  sessionId?: number;
}

export interface ApplyDto {
  type: SedimentType;
  target: SedimentTarget;
  title: string;
  content: string;
  kbId?: number;
  sessionId?: number;
}

/** 沉淀识别：LLM 分类（消息完成后异步调用，不阻塞回复） */
export function analyzeSediment(dto: AnalyzeDto): Promise<AnalyzeResult> {
  return httpClient.post<AnalyzeResult>("/sedimentation/analyze", dto);
}

/** 应用沉淀：knowledge_base 写知识库并记录（返回撤回令牌） */
export function applySediment(dto: ApplyDto): Promise<ApplyResult> {
  return httpClient.post<ApplyResult>("/sedimentation/apply", dto);
}

/** 撤回沉淀（删除对应知识库文档） */
export function undoSediment(undoToken: string): Promise<{ ok: boolean }> {
  return httpClient.post<{ ok: boolean }>("/sedimentation/undo", { undoToken });
}
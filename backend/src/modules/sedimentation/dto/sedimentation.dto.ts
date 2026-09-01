import { IsOptional, IsString, IsNumber, IsIn, MinLength, MaxLength } from "class-validator";

export type SedimentType = "enterprise_doc" | "customer_profile" | "data_update";
export type SedimentTarget = "knowledge_base" | "hermes_memory";

/** 沉淀识别请求：用户消息 + 最近上下文 */
export class AnalyzeDto {
  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsString({ each: true })
  history?: string[];

  /** 识别模型（缺省走用户 chat 默认模型） */
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  sessionId?: number;
}

/** 应用沉淀请求 */
export class ApplyDto {
  @IsIn(["enterprise_doc", "customer_profile", "data_update"])
  type: SedimentType;

  @IsIn(["knowledge_base", "hermes_memory"])
  target: SedimentTarget;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(1)
  content: string;

  /** 目标知识库（缺省用默认「对话沉淀」库） */
  @IsOptional()
  @IsNumber()
  kbId?: number;

  @IsOptional()
  @IsNumber()
  sessionId?: number;

  /** Hermes 编排任务溯源（可选）：云端沉淀回填 taskId + executionRef */
  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  executionRef?: string;
}

/** 撤回请求 */
export class UndoDto {
  @IsString()
  undoToken: string;
}

/** 分类器输出（LLM 原始 JSON 解析后） */
export interface AnalyzeOutput {
  type: "enterprise_doc" | "customer_profile" | "requirement" | "data_update" | "none";
  target: SedimentTarget | "requirement_draft" | "customer_profile" | null;
  title: string;
  content: string;
  confidence: number;
  operation?: "add" | "replace" | "remove";
}
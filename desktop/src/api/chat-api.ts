// 对话模块 API
//
// 端点契约：
//   POST   /chat/sessions                       创建会话
//   GET    /chat/sessions                       会话列表（支持 keyword/pinned）
//   GET    /chat/sessions/:id                   会话详情
//   DELETE /chat/sessions/:id                   删除会话
//   PATCH  /chat/sessions/:id                   更新会话（置顶/重命名等）
//   GET    /chat/sessions/:id/messages          消息列表（分页）
//   POST   /chat/sessions/:id/messages          发送消息（HTTP 持久化）
//   POST   /chat/sessions/:id/messages/stream   SSE 流式发送并接收
//
// SSE 端点返回 text/event-stream，事件类型：
//   message       { content: string }                  流式文本块
//   tool_call     { id, name, input, output, ... }     工具调用
//   credits       { amount, balance, frozen }          计费信息
//   done          { usage: TokenUsage }                完成
//   error         { message: string }                  错误

import { httpClient } from "./http-client";
import { useAuthStore } from "@/store/auth";
import type {
  ChatSession,
  ModelOption,
  ChatMessage,
  CreateSessionDto,
  SendMessageDto,
  SaveMessageDto,
  SessionQuery,
  PaginationQuery,
  PaginatedResult,
  StreamCallbacks,
  ToolCallInfo,
  TokenUsage,
  CreditsCostInfo,
} from "@/types/chat";

/** API 基础地址 */
const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3001/api";

/**
 * 创建会话
 * POST /chat/sessions
 */
export async function createSession(
  data: CreateSessionDto,
): Promise<ChatSession> {
  return httpClient.post<ChatSession>("/chat/sessions", data);
}

/**
 * 会话列表
 * GET /chat/sessions?keyword=xxx&pinned=true
 */
export async function listSessions(
  query: SessionQuery = {},
): Promise<PaginatedResult<ChatSession>> {
  return httpClient.get<PaginatedResult<ChatSession>>("/chat/sessions", {
    params: query,
  });
}

/**
 * 会话详情
 * GET /chat/sessions/:id
 */
export async function getSession(id: number): Promise<ChatSession> {
  return httpClient.get<ChatSession>(`/chat/sessions/${id}`);
}

/**
 * 删除会话
 * DELETE /chat/sessions/:id
 */
export async function deleteSession(id: number): Promise<void> {
  await httpClient.delete<void>(`/chat/sessions/${id}`);
}

/**
 * 更新会话（置顶/重命名等）
 * PATCH /chat/sessions/:id
 */
export async function updateSession(
  id: number,
  data: Partial<
    Pick<
      ChatSession,
      "title" | "pinned" | "modelId" | "agentId" | "knowledgeBaseId"
    >
  >,
): Promise<ChatSession> {
  return httpClient.patch<ChatSession>(`/chat/sessions/${id}`, data);
}

/**
 * 消息列表（分页）
 * GET /chat/sessions/:id/messages?page=1&pageSize=50
 */
export async function listMessages(
  sessionId: number,
  query: PaginationQuery = {},
): Promise<PaginatedResult<ChatMessage>> {
  return httpClient.get<PaginatedResult<ChatMessage>>(
    `/chat/sessions/${sessionId}/messages`,
    { params: query },
  );
}

/**
 * 发送消息（HTTP POST，仅持久化，不流式返回）
 * POST /chat/sessions/:id/messages
 */
export async function sendMessage(
  sessionId: number,
  dto: SendMessageDto,
): Promise<ChatMessage> {
  return httpClient.post<ChatMessage>(
    `/chat/sessions/${sessionId}/messages`,
    dto,
  );
}

/**
 * 保存消息（纯持久化，不触发 AI 调用）
 * POST /chat/sessions/:id/messages
 */
export async function saveMessage(
  sessionId: number,
  dto: SaveMessageDto,
): Promise<ChatMessage> {
  return httpClient.post<ChatMessage>(
    `/chat/sessions/${sessionId}/messages`,
    dto,
  );
}

/**
 * SSE 流式发送消息
 * POST /chat/sessions/:id/messages/stream
 *
 * 实现说明：
 * - 使用 fetch + ReadableStream，因为 EventSource 不支持 POST + Authorization Header
 * - 仅注入 Authorization（JWT 鉴权）
 * - 按 SSE 协议解析 `event: xxx\ndata: yyy\n\n` 帧
 *
 * @returns AbortController（调用 .abort() 可中断流）
 */
export function streamMessage(
  sessionId: number,
  dto: SendMessageDto,
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController();
  const url = `${API_BASE}/chat/sessions/${sessionId}/messages/stream`;

  void (async () => {
    try {
      const { accessToken } = useAuthStore.getState();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      };
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(dto),
        signal: controller.signal,
        credentials: "include",
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`SSE 连接失败 (${resp.status}): ${text}`);
      }
      if (!resp.body) {
        throw new Error("SSE 响应无 body");
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // 按 SSE 帧分隔符（双换行）拆分
        const frames = buffer.split("\n\n");
        // 最后一段可能不完整，留到下次
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          parseSseFrame(frame, callbacks);
        }
      }
      // 处理最后一段
      if (buffer.trim()) {
        parseSseFrame(buffer, callbacks);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      callbacks.onError(err as Error);
    }
  })();

  return controller;
}

/**
 * 解析单帧 SSE 消息
 * 帧格式：
 *   event: message
 *   data: {"content":"hello"}
 */
function parseSseFrame(frame: string, callbacks: StreamCallbacks): void {
  const lines = frame.split("\n");
  let event = "message";
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return;

  const raw = dataLines.join("\n");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = raw;
  }

  dispatchSseEvent(event, payload, callbacks);
}

/** 派发 SSE 事件到回调 */
function dispatchSseEvent(
  event: string,
  payload: unknown,
  callbacks: StreamCallbacks,
): void {
  switch (event) {
    case "message": {
      const data = payload as { content?: string };
      if (typeof data?.content === "string") {
        callbacks.onMessage(data.content);
      } else if (typeof payload === "string") {
        callbacks.onMessage(payload);
      }
      break;
    }
    case "tool_call": {
      callbacks.onToolCall?.(payload as ToolCallInfo);
      break;
    }
    case "credits": {
      callbacks.onCreditsCost?.(payload as CreditsCostInfo);
      break;
    }
    case "done": {
      const data = payload as { usage?: TokenUsage };
      callbacks.onComplete(
        data?.usage ??
          (payload as TokenUsage) ?? {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
      );
      break;
    }
    case "error": {
      const data = payload as { message?: string };
      callbacks.onError(new Error(data?.message || "流式响应错误"));
      break;
    }
    default:
      // 未知事件忽略
      break;
  }
}

/**
 * 对话页可选模型列表
 * GET /models/chat-options
 * 返回管理后台上线的启用模型（含积分单价，排除 image/video/embedding）
 */
export async function listChatModels(): Promise<ModelOption[]> {
  return httpClient.get<ModelOption[]>("/models/chat-options");
}

/**
 * 获取/生成用户 llm-proxy 静态 Key（登录后注入 OpenClaw，供应商 Key 在服务器）
 * GET /chat/accounting/proxy-key
 */
export async function fetchLlmProxyKey(): Promise<{ llmProxyKey: string }> {
  return httpClient.get<{ llmProxyKey: string }>("/chat/accounting/proxy-key");
}

/**
 * 保存用户默认对话模型（OpenClaw 本地直达对话：llm-proxy 收到 openclaw 内部模型名时按此解析）
 * POST /chat/accounting/preferred-model
 */
export async function setPreferredChatModel(
  modelId: string,
): Promise<{ modelId: string }> {
  return httpClient.post<{ modelId: string }>("/chat/accounting/preferred-model", {
    modelId,
  });
}

/** 用户每类默认模型（chat/vision/image/video/tts） */
export interface UserDefaultModels {
  chat: string | null;
  vision: string | null;
  image: string | null;
  video: string | null;
  tts: string | null;
}

/** 全量模型选项（设置页分类默认模型用；GET /models 返回带 modelType/modelId） */
export interface AllModelOption {
  id: number;
  name: string;
  provider?: string;
  modelType?: string;
  modelId?: string;
}

/**
 * 全量模型列表（含分类）
 * GET /models
 */
export async function listAllModels(): Promise<AllModelOption[]> {
  return httpClient.get<AllModelOption[]>("/models");
}

/**
 * 读取用户每类默认模型
 * GET /chat/accounting/default-models
 */
export async function getDefaultModels(): Promise<UserDefaultModels> {
  return httpClient.get<UserDefaultModels>("/chat/accounting/default-models");
}

/**
 * 保存用户每类默认模型（null/空串=清除该分类）
 * POST /chat/accounting/default-models
 */
export async function setDefaultModels(
  dto: Partial<UserDefaultModels>,
): Promise<UserDefaultModels> {
  return httpClient.post<UserDefaultModels>("/chat/accounting/default-models", dto);
}

export default {
  createSession,
  listSessions,
  getSession,
  deleteSession,
  updateSession,
  listMessages,
  sendMessage,
  streamMessage,
  listChatModels,
  fetchLlmProxyKey,
  setPreferredChatModel,
  listAllModels,
  getDefaultModels,
  setDefaultModels,
};

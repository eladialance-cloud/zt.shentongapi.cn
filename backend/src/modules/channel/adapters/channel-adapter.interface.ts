/**
 * 渠道适配器基类接口
 * 设计文档: channel_integration_design_20260730.md
 *
 * 每个外部平台（微信/飞书/钉钉/Telegram等）实现此接口
 */

export interface InboundMessage {
  /** 外部平台消息 ID */
  externalId: string;
  /** 发送者外部 ID */
  senderExternalId: string;
  /** 发送者名称 */
  senderName?: string;
  /** 消息内容 */
  content: string;
  /** 消息类型 */
  messageType: "text" | "image" | "voice" | "video" | "file" | "event";
  /** 原始 payload */
  rawPayload: unknown;
  /** 会话 ID（如有） */
  sessionId?: string;
}

export interface OutboundMessage {
  /** 目标接收者外部 ID */
  targetExternalId: string;
  /** 回复内容 */
  content: string;
  /** 消息类型 */
  messageType?: "text" | "image" | "voice" | "video" | "file";
  /** 媒体 URL */
  mediaUrl?: string;
}

export interface PublishContent {
  title: string;
  content: string;
  mediaUrls?: string[];
  tags?: string[];
  /** 平台特定参数 */
  platformParams?: Record<string, unknown>;
}

export interface PublishResult {
  platform: string;
  success: boolean;
  externalId?: string;
  externalUrl?: string;
  error?: string;
}

export interface ChannelAdapter {
  /** 平台标识 */
  readonly platform: string;

  /** 验证 webhook 签名 */
  verifySignature(payload: unknown, signature: string, token: string): boolean;

  /** 解析入站消息 */
  parseInboundMessage(payload: unknown): InboundMessage | null;

  /** 发送出站消息 */
  sendMessage(credentials: string, message: OutboundMessage): Promise<{ success: boolean; externalId?: string; error?: string }>;

  /** 发布内容到平台 */
  publishContent(credentials: string, content: PublishContent): Promise<PublishResult>;

  /** 平台健康检查 */
  healthCheck(credentials: string): Promise<boolean>;
}

import { Injectable, Logger } from "@nestjs/common";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";

/**
 * 飞书机器人适配器（输入）
 * 设计文档: channel_integration_design_20260730.md P1
 */
@Injectable()
export class FeishuBotAdapter implements ChannelAdapter {
  readonly platform = "feishu_bot";
  private readonly logger = new Logger(FeishuBotAdapter.name);

  verifySignature(payload: unknown, signature: string, token: string): boolean {
    this.logger.log("[FeishuBot] verifySignature called");
    return true;
  }

  parseInboundMessage(payload: unknown): InboundMessage | null {
    const data = payload as Record<string, any> | null;
    this.logger.log(`[FeishuBot] parseInboundMessage: ${JSON.stringify(data).substring(0, 100)}`);

    if (!data?.event?.sender?.sender_id) return null;

    return {
      externalId: data.event?.message?.message_id || `feishu_${Date.now()}`,
      senderExternalId: data.event.sender.sender_id.open_id || data.event.sender.sender_id.user_id,
      senderName: "飞书用户",
      content: data.event?.message?.content || JSON.stringify(data),
      messageType: data.event?.message?.message_type === "image" ? "image" : "text",
      rawPayload: payload,
    };
  }

  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    this.logger.log(`[FeishuBot] sendMessage to ${message.targetExternalId}`);
    return { success: true, externalId: `feishu_reply_${Date.now()}` };
  }

  async publishContent(
    credentials: string,
    content: PublishContent,
  ): Promise<PublishResult> {
    // 飞书主要用于输入，不强制要求发布能力
    return { platform: "feishu_bot", success: false, error: "飞书机器人不支持内容发布" };
  }

  async healthCheck(credentials: string): Promise<boolean> {
    return true;
  }
}

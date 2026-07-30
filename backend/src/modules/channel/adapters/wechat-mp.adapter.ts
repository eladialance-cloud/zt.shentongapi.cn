import { Injectable, Logger } from "@nestjs/common";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";

/**
 * 微信公众号适配器（输入+输出）
 * 设计文档: channel_integration_design_20260730.md P0
 *
 * 公众号消息接入：用户发送消息到公众号 → 回调到此适配器 → 路由到 Agent/团队处理
 */
@Injectable()
export class WechatMpAdapter implements ChannelAdapter {
  readonly platform = "wechat_mp";
  private readonly logger = new Logger(WechatMpAdapter.name);

  verifySignature(payload: unknown, signature: string, token: string): boolean {
    // TODO: 实现微信签名验证（SHA1）
    this.logger.log("[WechatMp] verifySignature called");
    return true;
  }

  parseInboundMessage(payload: unknown): InboundMessage | null {
    const xml = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.logger.log(`[WechatMp] parseInboundMessage: ${xml.substring(0, 100)}`);
    // TODO: 解析微信XML消息体
    return {
      externalId: `wx_${Date.now()}`,
      senderExternalId: "wx_user_openid",
      senderName: "微信用户",
      content: typeof payload === "string" ? payload : "",
      messageType: "text",
      rawPayload: payload,
    };
  }

  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    this.logger.log(`[WechatMp] sendMessage to ${message.targetExternalId}`);
    // TODO: 调用微信客服消息API
    return { success: true, externalId: `wx_reply_${Date.now()}` };
  }

  async publishContent(
    credentials: string,
    content: PublishContent,
  ): Promise<PublishResult> {
    this.logger.log(`[WechatMp] publishContent: ${content.title}`);
    // TODO: 调用微信素材管理+群发API
    return {
      platform: "wechat_mp",
      success: true,
      externalId: `wx_pub_${Date.now()}`,
    };
  }

  async healthCheck(credentials: string): Promise<boolean> {
    // TODO: 调用微信 access_token 接口验证
    return true;
  }
}

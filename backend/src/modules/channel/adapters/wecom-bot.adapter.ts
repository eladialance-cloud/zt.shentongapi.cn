import { Injectable, Logger } from "@nestjs/common";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";

/**
 * 企业微信群机器人适配器（仅出站）
 *
 * 凭证格式（credentials，AES 加密存储）：
 *   { "webhookUrl": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx" }
 * 或 { "key": "xxx" }（自动拼 webhook 地址）
 *
 * 群机器人仅支持群内主动推送，不支持接收消息（入站回调待接入）。
 * 参考：https://developer.work.weixin.qq.com/document/path/91770
 */
@Injectable()
export class WecomBotAdapter implements ChannelAdapter {
  readonly platform = "wecom_bot";
  private readonly logger = new Logger(WecomBotAdapter.name);

  /** 群机器人无入站签名，恒真（接口留位，便于后续接入回调） */
  verifySignature(_payload: unknown, _signature: string, _token: string): boolean {
    return true;
  }

  parseInboundMessage(_payload: unknown): InboundMessage | null {
    return null;
  }

  /** 群机器人推送（text 优先，超长自动截断） */
  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const cfg = this.parseCredentials(credentials);
    const url = this.resolveWebhookUrl(cfg);
    if (!url) return { success: false, error: "未配置企业微信群机器人 Webhook 地址" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msgtype: "text",
          text: { content: String(message.content ?? "").slice(0, 2000) },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      if (data?.errcode === 0) {
        this.logger.log(`[WecomBot] 推送成功: ${String(message.content ?? "").substring(0, 60)}`);
        return { success: true, externalId: `wecom_bot_${Date.now()}` };
      }
      const err = `企业微信群机器人推送失败: ${JSON.stringify(data ?? res.status)}`;
      this.logger.error(`[WecomBot] ${err}`);
      return { success: false, error: err };
    } catch (err) {
      this.logger.error(`[WecomBot] 推送异常: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  async publishContent(_credentials: string, _content: PublishContent): Promise<PublishResult> {
    return { platform: "wecom_bot", success: false, error: "企业微信群机器人不支持内容发布" };
  }

  async healthCheck(credentials: string): Promise<boolean> {
    return Boolean(this.resolveWebhookUrl(this.parseCredentials(credentials)));
  }

  private resolveWebhookUrl(cfg: Record<string, any> | null): string | null {
    const direct = cfg?.webhookUrl ?? cfg?.webhook_url;
    if (typeof direct === "string" && /^https?:\/\//.test(direct)) return direct;
    const key = cfg?.key ?? cfg?.webhookToken;
    if (typeof key === "string" && key) {
      return `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${encodeURIComponent(key)}`;
    }
    return null;
  }

  private parseCredentials(credentials: string): Record<string, any> | null {
    try {
      return JSON.parse(credentials || "{}");
    } catch {
      return null;
    }
  }
}

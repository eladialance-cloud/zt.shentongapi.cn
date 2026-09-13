import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";

/**
 * Telegram Bot 适配器（输入 + 输出）
 *
 * 凭证格式（credentials，AES 加密存储）：
 *   { "botToken": "123456:ABC...", "webhookSecret": "..." }
 *
 * - 入站：setWebhook 回调（POST JSON update）；校验 header「X-Telegram-Bot-Api-Secret-Token」
 * - 出站：https://api.telegram.org/bot<token>/sendMessage
 * 参考：https://core.telegram.org/bots/api#setwebhook
 */
@Injectable()
export class TelegramBotAdapter implements ChannelAdapter {
  readonly platform = "telegram_bot";
  private readonly logger = new Logger(TelegramBotAdapter.name);

  /**
   * 校验 Telegram webhook secret_token
   * Telegram 用 header「X-Telegram-Bot-Api-Secret-Token」原样回传 secret；定长比较防时序攻击。
   */
  verifySignature(
    _payload: unknown,
    signature: string,
    secret: string,
    _timestamp?: string,
    _rawBody?: string,
  ): boolean {
    if (!secret) {
      this.logger.warn("[Telegram] 未配置 webhookSecret，跳过校验（开发模式）");
      return true;
    }
    if (!signature) {
      this.logger.warn("[Telegram] 缺少 X-Telegram-Bot-Api-Secret-Token，拒绝");
      return false;
    }
    try {
      const a = Buffer.from(signature);
      const b = Buffer.from(secret);
      if (a.length !== b.length) return false;
      const ok = crypto.timingSafeEqual(a, b);
      if (!ok) this.logger.warn("[Telegram] secret_token 校验失败");
      return ok;
    } catch (err) {
      this.logger.error(`[Telegram] 校验异常: ${(err as Error).message}`);
      return false;
    }
  }

  /** 解析 Telegram update */
  parseInboundMessage(payload: unknown): InboundMessage | null {
    const data = (payload ?? {}) as Record<string, any>;
    const msg = data.message ?? data.edited_message ?? data.channel_post;
    if (!msg) return null;
    const from = msg.from ?? {};
    const chat = msg.chat ?? {};
    const text = msg.text ?? msg.caption ?? "";
    if (!text) return null;
    return {
      externalId: `telegram_${msg.message_id ?? Date.now()}`,
      senderExternalId: String(chat.id ?? from.id ?? ""),
      senderName: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Telegram 用户",
      content: String(text).trim(),
      messageType: "text",
      rawPayload: payload,
      sessionId: chat.id ? String(chat.id) : undefined,
    };
  }

  /** 发送 Telegram 消息（sendMessage，按 chat_id） */
  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const cfg = this.parseCredentials(credentials);
    const token = cfg?.botToken ?? cfg?.token;
    if (!token) return { success: false, error: "未配置 Telegram Bot Token" };
    if (!message.targetExternalId) return { success: false, error: "缺少接收者 chat_id（targetExternalId）" };
    try {
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.targetExternalId,
          text: String(message.content ?? "").slice(0, 4000),
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      if (data?.ok) {
        this.logger.log(`[Telegram] 发送成功: ${String(message.content ?? "").substring(0, 60)}`);
        return { success: true, externalId: String(data?.result?.message_id ?? `telegram_reply_${Date.now()}`) };
      }
      const err = `Telegram 发送失败: ${JSON.stringify(data ?? res.status)}`;
      this.logger.error(`[Telegram] ${err}`);
      return { success: false, error: err };
    } catch (err) {
      this.logger.error(`[Telegram] 发送异常: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  /** 调用 setWebhook 注册回调地址（供渠道详情页「一键设置」用） */
  async setWebhook(botToken: string, url: string, secretToken?: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(botToken)}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, secret_token: secretToken || undefined }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      if (data?.ok) return { ok: true };
      return { ok: false, error: String(data?.description ?? res.status) };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  async publishContent(_credentials: string, _content: PublishContent): Promise<PublishResult> {
    return { platform: "telegram_bot", success: false, error: "Telegram 机器人不支持内容发布" };
  }

  async healthCheck(credentials: string): Promise<boolean> {
    const cfg = this.parseCredentials(credentials);
    const token = cfg?.botToken ?? cfg?.token;
    if (!token) return false;
    try {
      const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/getMe`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      return Boolean(data?.ok);
    } catch {
      return false;
    }
  }

  private parseCredentials(credentials: string): Record<string, any> | null {
    try {
      return JSON.parse(credentials || "{}");
    } catch {
      return null;
    }
  }
}

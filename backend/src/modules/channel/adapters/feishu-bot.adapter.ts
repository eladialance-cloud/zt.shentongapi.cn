import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";

/**
 * 飞书机器人适配器（输入+输出）
 * 设计文档: channel_integration_design_20260730.md P1 / 自动化工作台方案 B1/B5
 *
 * 凭证格式（credentials，AES 加密存储）：
 *   { "appId": "...", "appSecret": "..." }              → 开放平台应用（可主动私聊/群聊回复）
 *   { "webhookToken": "..." }                            → 自定义机器人 webhook（回复到所在群）
 *   webhookToken 也可放在渠道的 webhookToken 字段（适配器同样识别）
 */
@Injectable()
export class FeishuBotAdapter implements ChannelAdapter {
  readonly platform = "feishu_bot";
  private readonly logger = new Logger(FeishuBotAdapter.name);

  /**
   * 校验飞书 webhook 签名（自定义机器人签名算法）
   * stringToSign = `${timestamp}\n${token}`，HMAC-SHA256(key=stringToSign, rawBody) → base64
   * 未配置 token 时跳过校验（开发模式），返回 true
   */
  verifySignature(
    payload: unknown,
    signature: string,
    token: string,
    timestamp?: string,
  ): boolean {
    // 飞书开放平台明文事件回调（加密策略=不加密）不携带签名头，跳过校验
    if (!signature || !timestamp) {
      this.logger.log("[FeishuBot] 无签名头（开放平台明文事件），跳过签名校验");
      return true;
    }
    if (!token) {
      this.logger.warn("[FeishuBot] 未配置 webhookToken，跳过签名校验（开发模式）");
      return true;
    }
    try {
      const rawBody =
        typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
      const stringToSign = `${timestamp}\n${token}`;
      const hmac = crypto.createHmac("sha256", stringToSign).update(rawBody).digest("base64");
      const ok = hmac === signature;
      if (!ok) this.logger.warn("[FeishuBot] 签名校验失败");
      return ok;
    } catch (err) {
      this.logger.error(`[FeishuBot] 签名校验异常: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * 飞书开放平台加密回调解密（AES-256-CBC + PKCS7）
   * Encrypt Key 为 base64 编码的 32 字节密钥；encrypt 字段 base64 解码后前 16 字节为 IV。
   * 返回解密后的 JSON 对象；未加密或缺少密钥返回 null。
   */
  decryptPayload(payload: unknown, encryptKey: string): Record<string, any> | null {
    const data = payload as Record<string, any> | null;
    if (!data?.encrypt || !encryptKey) return null;
    try {
      const key = Buffer.from(encryptKey, "base64");
      const enc = Buffer.from(data.encrypt, "base64");
      if (key.length !== 32 || enc.length <= 16) {
        this.logger.error("[FeishuBot] 解密参数非法 key=" + key.length + " enc=" + enc.length);
        return null;
      }
      const iv = enc.subarray(0, 16);
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      const decrypted = Buffer.concat([decipher.update(enc.subarray(16)), decipher.final()]);
      return JSON.parse(decrypted.toString("utf8"));
    } catch (err) {
      this.logger.error("[FeishuBot] 回调解密失败: " + (err as Error).message);
      return null;
    }
  }

  parseInboundMessage(payload: unknown): InboundMessage | null {
    const data = payload as Record<string, any> | null;
    this.logger.log(`[FeishuBot] parseInboundMessage: ${JSON.stringify(data).substring(0, 160)}`);

    if (!data?.event?.sender?.sender_id) return null;

    const message = data.event?.message || {};
    // 飞书文本消息 content 为 JSON 字符串 {"text":"..."}
    let text = "";
    try {
      const parsed = JSON.parse(message?.content || "{}");
      text = typeof parsed?.text === "string" ? parsed.text : "";
    } catch {
      text = typeof message?.content === "string" ? message.content : "";
    }

    return {
      externalId: message?.message_id || `feishu_${Date.now()}`,
      senderExternalId: data.event.sender.sender_id.open_id || data.event.sender.sender_id.user_id,
      senderName: "飞书用户",
      content: text,
      messageType: message?.message_type === "image" ? "image" : "text",
      rawPayload: payload,
      sessionId: message?.chat_id,
    };
  }

  /**
   * 发送消息到飞书
   * 优先级：自定义机器人 webhook（最简单，回复到所在群） > 开放平台应用（私聊/群聊指定人）
   */
  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    let cfg: Record<string, any> = {};
    try {
      cfg = JSON.parse(credentials || "{}");
    } catch {
      cfg = {};
    }
    const appId = cfg?.appId;
    const appSecret = cfg?.appSecret;
    const webhookToken = cfg?.webhookToken || cfg?.token || cfg?.webhook_token;

    if (webhookToken) {
      return this.sendViaWebhook(webhookToken, message);
    }
    if (appId && appSecret) {
      return this.sendViaOpenApi(appId, appSecret, message);
    }

    const err = "未配置飞书发送凭证（credentials.webhookToken 或 credentials.appId+appSecret）";
    this.logger.warn(`[FeishuBot] ${err}`);
    return { success: false, error: err };
  }

  /** 自定义机器人 webhook：只能发送到机器人所在群 */
  private async sendViaWebhook(
    webhookToken: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    try {
      const url = `https://open.feishu.cn/open-apis/bot/v2/hook/${encodeURIComponent(webhookToken)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          msg_type: "text",
          content: { text: message.content },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      if (data?.code === 0 || data?.StatusCode === 0) {
        this.logger.log(`[FeishuBot] webhook 发送成功: ${message.content.substring(0, 60)}`);
        return { success: true, externalId: `feishu_reply_${Date.now()}` };
      }
      const err = `飞书 webhook 返回错误: ${JSON.stringify(data ?? res.status)}`;
      this.logger.error(`[FeishuBot] ${err}`);
      return { success: false, error: err };
    } catch (err) {
      this.logger.error(`[FeishuBot] webhook 发送异常: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  /** 开放平台应用：tenant_access_token + im/v1/messages 主动私聊 */
  private async sendViaOpenApi(
    appId: string,
    appSecret: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    try {
      const tokenRes = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
        signal: AbortSignal.timeout(15000),
      });
      const tokenData = (await tokenRes.json().catch(() => null)) as Record<string, any> | null;
      const accessToken = tokenData?.tenant_access_token;
      if (!accessToken) {
        const err = `获取飞书 tenant_access_token 失败: ${JSON.stringify(tokenData ?? tokenRes.status)}`;
        this.logger.error(`[FeishuBot] ${err}`);
        return { success: false, error: err };
      }
      const target = message.targetExternalId;
      if (!target) {
        return { success: false, error: "缺少接收者 open_id（targetExternalId）" };
      }
      const res = await fetch("https://open.feishu.cn/open-apis/im/v1/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          receive_id_type: "open_id",
          receive_id: target,
          msg_type: "text",
          content: JSON.stringify({ text: message.content }),
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      if (data?.code === 0) {
        return { success: true, externalId: data?.data?.message_id || `feishu_reply_${Date.now()}` };
      }
      const err = `飞书开放平台发送失败: ${JSON.stringify(data ?? res.status)}`;
      this.logger.error(`[FeishuBot] ${err}`);
      return { success: false, error: err };
    } catch (err) {
      this.logger.error(`[FeishuBot] 开放平台发送异常: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  async publishContent(
    credentials: string,
    content: PublishContent,
  ): Promise<PublishResult> {
    // 飞书主要用于 IM 指令收发，不强制要求内容发布能力
    return { platform: "feishu_bot", success: false, error: "飞书机器人不支持内容发布" };
  }

  async healthCheck(credentials: string): Promise<boolean> {
    const cfg = this.parseCredentials(credentials);
    return Boolean(cfg?.webhookToken || (cfg?.appId && cfg?.appSecret));
  }

  private parseCredentials(credentials: string): Record<string, any> | null {
    try {
      return JSON.parse(credentials || "{}");
    } catch {
      return null;
    }
  }
}

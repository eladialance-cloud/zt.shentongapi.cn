import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";

/**
 * 钉钉机器人适配器（输入 + 输出）
 *
 * 凭证格式（credentials，AES 加密存储）：
 *   { "webhookToken": "...", "secret": "SEC..." }   群机器人 webhook（出站推送）
 *   { "appKey": "...", "appSecret": "..." }         企业内部应用（可选，出站加签用）
 *
 * - 入站：机器人「Outgoing 机制」回调，header 携带 timestamp + sign
 *         sign = base64(HMAC-SHA256(timestamp + "\n" + secret, secret))
 * - 出站：群机器人 webhook，timestamp+sign 加签后 POST robot/send
 * 参考：https://open.dingtalk.com/document/orgapp/robot-outgoing-mechanism
 */
@Injectable()
export class DingtalkBotAdapter implements ChannelAdapter {
  readonly platform = "dingtalk_bot";
  private readonly logger = new Logger(DingtalkBotAdapter.name);

  /**
   * 校验钉钉 Outgoing 签名
   * stringToSign = `${timestamp}\n${secret}`，sign = base64(HMAC-SHA256(stringToSign, secret))
   * 未配置 secret 时跳过校验（开发模式），返回 true
   */
  verifySignature(
    payload: unknown,
    signature: string,
    secret: string,
    timestamp?: string,
    _rawBody?: string,
  ): boolean {
    if (!secret) {
      this.logger.warn("[Dingtalk] 未配置加签密钥 secret，跳过签名校验（开发模式）");
      return true;
    }
    if (!signature || !timestamp) {
      this.logger.warn("[Dingtalk] 缺少 timestamp/sign 头，拒绝");
      return false;
    }
    // 时间戳有效期 1 小时，防重放
    const ts = Number(timestamp);
    if (Number.isFinite(ts) && Math.abs(Date.now() - ts) > 60 * 60 * 1000) {
      this.logger.warn("[Dingtalk] 签名时间戳超出有效期");
      return false;
    }
    try {
      const stringToSign = `${timestamp}\n${secret}`;
      const expected = crypto
        .createHmac("sha256", secret)
        .update(stringToSign, "utf8")
        .digest("base64");
      const ok = expected === signature;
      if (!ok) this.logger.warn("[Dingtalk] 签名校验失败");
      return ok;
    } catch (err) {
      this.logger.error(`[Dingtalk] 签名校验异常: ${(err as Error).message}`);
      return false;
    }
  }

  /** 解析钉钉 Outgoing 入站消息 */
  parseInboundMessage(payload: unknown): InboundMessage | null {
    const data = (payload ?? {}) as Record<string, any>;
    const senderId = data.senderId ?? data.senderStaffId;
    if (!senderId) return null;
    const text = data?.text?.content ?? data?.content ?? "";
    const clean = String(text).replace(/^@\S+\s*/, "").trim();
    if (!clean) return null;
    return {
      externalId: `dingtalk_${data.msgId ?? Date.now()}`,
      senderExternalId: String(senderId),
      senderName: data.senderNick ? String(data.senderNick) : "钉钉用户",
      content: clean,
      messageType: "text",
      rawPayload: payload,
      sessionId: data.conversationId ? String(data.conversationId) : undefined,
    };
  }

  /** 发送钉钉群机器人消息（text，加签） */
  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const cfg = this.parseCredentials(credentials);
    const token = cfg?.webhookToken ?? cfg?.access_token ?? cfg?.token;
    if (!token) return { success: false, error: "未配置钉钉 Webhook Token" };
    const secret = cfg?.secret ?? cfg?.appSecret ?? "";
    try {
      let url = `https://oapi.dingtalk.com/robot/send?access_token=${encodeURIComponent(token)}`;
      if (secret) {
        const timestamp = Date.now();
        const stringToSign = `${timestamp}\n${secret}`;
        const sign = crypto.createHmac("sha256", secret).update(stringToSign, "utf8").digest("base64");
        url += `&timestamp=${timestamp}&sign=${encodeURIComponent(sign)}`;
      }
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
        this.logger.log(`[Dingtalk] 发送成功: ${String(message.content ?? "").substring(0, 60)}`);
        return { success: true, externalId: `dingtalk_reply_${Date.now()}` };
      }
      const err = `钉钉发送失败: ${JSON.stringify(data ?? res.status)}`;
      this.logger.error(`[Dingtalk] ${err}`);
      return { success: false, error: err };
    } catch (err) {
      this.logger.error(`[Dingtalk] 发送异常: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  async publishContent(_credentials: string, _content: PublishContent): Promise<PublishResult> {
    return { platform: "dingtalk_bot", success: false, error: "钉钉机器人不支持内容发布" };
  }

  async healthCheck(credentials: string): Promise<boolean> {
    const cfg = this.parseCredentials(credentials);
    return Boolean(cfg?.webhookToken || cfg?.token || cfg?.access_token);
  }

  private parseCredentials(credentials: string): Record<string, any> | null {
    try {
      return JSON.parse(credentials || "{}");
    } catch {
      return null;
    }
  }
}

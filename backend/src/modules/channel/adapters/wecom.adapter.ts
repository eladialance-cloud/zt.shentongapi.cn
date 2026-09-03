import { Injectable, Logger } from "@nestjs/common";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";
import {
  decryptWecomMessage, encryptWecomMessage, parseXmlObject, verifyWechatSignature,
} from "../utils/wechat-crypto";

/**
 * 企业微信适配器（输入+输出，B1 新建）
 * 设计文档: channel_integration_design_20260730.md / 自动化工作台方案 B1
 *
 * 凭证格式（credentials，AES 加密存储）：
 *   { "corpId": "...", "corpSecret": "...", "agentId": "...", "encodingAesKey": "43字符" }
 *   channel.webhookToken = 企业微信回调 Token（用于 msg_signature 校验）
 *
 * - 入站：GET echostr 回显；POST 加密事件回调（msg_signature + AES 解密）
 * - 出站：应用消息 API（corpid+secret → access_token → message/send）
 */
@Injectable()
export class WecomAdapter implements ChannelAdapter {
  readonly platform = "wechat_work";
  private readonly logger = new Logger(WecomAdapter.name);
  /** access_token 缓存：corpId -> { token, expiresAt } */
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  /** 企业微信签名校验：SHA1(sort(token, timestamp, nonce, encrypt)) */
  verifySignature(
    payload: unknown,
    signature: string,
    token: string,
  ): boolean {
    const data = (payload ?? {}) as Record<string, string | undefined>;
    return verifyWechatSignature(
      token,
      data?.timestamp ?? "",
      data?.nonce ?? "",
      signature,
      data?.encrypt,
    );
  }

  /** 解密回调密文 → 明文 JSON/XML */
  decryptPayload(payload: unknown, encodingAesKey: string): { message: string; receiveId: string } {
    const data = (payload ?? {}) as Record<string, string | undefined>;
    return decryptWecomMessage(data?.encrypt ?? "", encodingAesKey);
  }

  /** 加密回复（企业微信要求密文回包时使用） */
  encryptReply(message: string, encodingAesKey: string, receiveId: string): string {
    return encryptWecomMessage(message, encodingAesKey, receiveId);
  }

  /** 解析企业微信入站消息（明文 JSON 事件 / 解密后的 XML） */
  parseInboundMessage(payload: unknown): InboundMessage | null {
    // 解密后是 XML（含 Event/FromUserName/Content），也兼容明文 JSON
    const xml = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
    const data = parseXmlObject(xml);
    const userName = data.FromUserName || (payload as Record<string, any>)?.FromUserName;
    if (!userName) return null;

    const msgType = data.MsgType ?? data.Event ?? "text";
    let content = "";
    if (data.Content) {
      content = data.Content;
    } else if (data.Event === "click") {
      content = `[菜单] ${data.EventKey ?? ""}`;
    } else if (data.Event) {
      content = `[事件] ${data.Event}`;
    }

    return {
      externalId: `wecom_${data.MsgId ?? Date.now()}`,
      senderExternalId: userName,
      senderName: "企业微信用户",
      content,
      messageType: msgType === "text" ? "text" : "event",
      rawPayload: data,
      sessionId: data.ToUserName,
    };
  }

  /** 发送企业微信应用消息（text，touser=userid） */
  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const cfg = this.parseCredentials(credentials);
    if (!cfg?.corpId || !cfg?.corpSecret) {
      return { success: false, error: "未配置企业微信 corpId/corpSecret" };
    }
    if (!message.targetExternalId) {
      return { success: false, error: "缺少接收者 userid（targetExternalId）" };
    }
    const accessToken = await this.getAccessToken(cfg.corpId, cfg.corpSecret);
    if (!accessToken) return { success: false, error: "获取企业微信 access_token 失败" };
    try {
      const res = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            touser: message.targetExternalId,
            agentid: Number(cfg.agentId ?? 0),
            msgtype: "text",
            text: { content: String(message.content ?? "").slice(0, 2000) },
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (data?.errcode === 0) {
        this.logger.log(`[Wecom] 应用消息发送成功: ${String(message.content ?? "").substring(0, 60)}`);
        return { success: true, externalId: `wecom_reply_${Date.now()}` };
      }
      const err = `企业微信发送失败: ${JSON.stringify(data ?? res.status)}`;
      this.logger.error(`[Wecom] ${err}`);
      return { success: false, error: err };
    } catch (err) {
      this.logger.error(`[Wecom] 发送异常: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  /** 企业微信不承载内容群发 */
  async publishContent(
    credentials: string,
    content: PublishContent,
  ): Promise<PublishResult> {
    return { platform: "wechat_work", success: false, error: "企业微信暂不支持内容群发" };
  }

  /** 健康检查 */
  async healthCheck(credentials: string): Promise<boolean> {
    const cfg = this.parseCredentials(credentials);
    if (!cfg?.corpId || !cfg?.corpSecret) return false;
    return Boolean(await this.getAccessToken(cfg.corpId, cfg.corpSecret));
  }

  /** 获取企业微信 access_token（带缓存） */
  private async getAccessToken(corpId: string, corpSecret: string): Promise<string | null> {
    const cached = this.tokenCache.get(corpId);
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token;
    try {
      const res = await fetch(
        `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(corpId)}&corpsecret=${encodeURIComponent(corpSecret)}`,
        { signal: AbortSignal.timeout(15000) },
      );
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const token = data?.access_token as string | undefined;
      const expiresIn = Number(data?.expires_in ?? 7200);
      if (!token) {
        this.logger.error(`[Wecom] access_token 获取失败: ${JSON.stringify(data)}`);
        return null;
      }
      this.tokenCache.set(corpId, { token, expiresAt: Date.now() + expiresIn * 1000 });
      return token;
    } catch (err) {
      this.logger.error(`[Wecom] access_token 异常: ${(err as Error).message}`);
      return null;
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
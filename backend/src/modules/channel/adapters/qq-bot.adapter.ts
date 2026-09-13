import { Injectable, Logger } from "@nestjs/common";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";

/**
 * QQ 开放平台机器人适配器（入站 + 出站）
 *
 * 凭证格式（credentials，AES 加密存储）：
 *   { "appId": "...", "appSecret": "...", "token": "..." }
 *
 * - 出站：先取 AppAccessToken（bots.qq.com/app/getAppAccessToken）再调用 v2 消息接口
 * - 入站：Webhook 回调（Ed25519 验签，需 platform webhook token）；此处仅解析载荷，
 *         验签在路由层用 webhookToken 完成（当前版本以 token 明文比对兜底）
 * 参考：https://bot.q.qq.com/wiki/
 */
@Injectable()
export class QqBotAdapter implements ChannelAdapter {
  readonly platform = "qq_bot";
  private readonly logger = new Logger(QqBotAdapter.name);
  /** appId -> { token, expiresAt } */
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  /** QQ 官方回调使用 Ed25519 签名；此处以平台 Token 明文比对兜底，未配置则跳过 */
  verifySignature(_payload: unknown, signature: string, token: string): boolean {
    if (!token) {
      this.logger.warn("[QqBot] 未配置 Token，跳过校验（开发模式）");
      return true;
    }
    if (!signature) return false;
    return signature === token;
  }

  /** 解析 QQ 机器人入站消息 */
  parseInboundMessage(payload: unknown): InboundMessage | null {
    const data = (payload ?? {}) as Record<string, any>;
    const d = data.d ?? data;
    const author = d?.author ?? {};
    const content = String(d?.content ?? "").trim();
    if (!content) return null;
    return {
      externalId: `qq_${d?.id ?? Date.now()}`,
      senderExternalId: String(author?.id ?? author?.user_openid ?? ""),
      senderName: author?.username ? String(author.username) : "QQ 用户",
      content,
      messageType: "text",
      rawPayload: payload,
      sessionId: d?.channel_id ? String(d.channel_id) : undefined,
    };
  }

  /** 发送 QQ 机器人消息（C2C 私聊，需 openid） */
  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const cfg = this.parseCredentials(credentials);
    const appId = cfg?.appId;
    const appSecret = cfg?.appSecret ?? cfg?.clientSecret;
    if (!appId || !appSecret) return { success: false, error: "未配置 QQ 机器人 AppID/AppSecret" };
    if (!message.targetExternalId) return { success: false, error: "缺少接收者 openid（targetExternalId）" };
    const accessToken = await this.getAccessToken(appId, appSecret);
    if (!accessToken) return { success: false, error: "获取 QQ AppAccessToken 失败" };
    try {
      const res = await fetch(
        `https://api.sgroup.qq.com/v2/users/${encodeURIComponent(message.targetExternalId)}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `QQBot ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: String(message.content ?? "").slice(0, 2000),
            msg_type: 0,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      if (res.ok && data?.id) {
        return { success: true, externalId: String(data.id) };
      }
      const err = `QQ 机器人发送失败: ${JSON.stringify(data ?? res.status)}`;
      this.logger.error(`[QqBot] ${err}`);
      return { success: false, error: err };
    } catch (err) {
      this.logger.error(`[QqBot] 发送异常: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  async publishContent(_credentials: string, _content: PublishContent): Promise<PublishResult> {
    return { platform: "qq_bot", success: false, error: "QQ 机器人不支持内容发布" };
  }

  async healthCheck(credentials: string): Promise<boolean> {
    const cfg = this.parseCredentials(credentials);
    if (!cfg?.appId || !(cfg?.appSecret ?? cfg?.clientSecret)) return false;
    return Boolean(await this.getAccessToken(cfg.appId, cfg.appSecret ?? cfg.clientSecret));
  }

  private async getAccessToken(appId: string, clientSecret: string): Promise<string | null> {
    const cached = this.tokenCache.get(appId);
    if (cached && cached.expiresAt > Date.now() + 60 * 1000) return cached.token;
    try {
      const res = await fetch("https://bots.qq.com/app/getAppAccessToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, clientSecret }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await res.json().catch(() => null)) as Record<string, any> | null;
      const token = data?.access_token as string | undefined;
      const expiresIn = Number(data?.expires_in ?? 7200);
      if (!token) {
        this.logger.error(`[QqBot] AppAccessToken 获取失败: ${JSON.stringify(data)}`);
        return null;
      }
      this.tokenCache.set(appId, { token, expiresAt: Date.now() + expiresIn * 1000 });
      return token;
    } catch (err) {
      this.logger.error(`[QqBot] AppAccessToken 异常: ${(err as Error).message}`);
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

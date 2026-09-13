import { Injectable, Logger } from "@nestjs/common";
import {
  ChannelAdapter, InboundMessage, OutboundMessage, PublishContent, PublishResult,
} from "./channel-adapter.interface";
import { parseXmlObject, serializeXml, verifyWechatSignature } from "../utils/wechat-crypto";

/**
 * 微信公众号适配器（输入+输出，B1 补全）
 * 设计文档: channel_integration_design_20260730.md P0 / 自动化工作台方案 B1
 *
 * 凭证格式（credentials，AES 加密存储）：
 *   { "appId": "...", "appSecret": "...", "token": "公众号 Token" }
 *
 * - 入站：GET 签名校验回显 echostr；POST XML 文本/事件消息
 * - 出站：客服消息 API（access_token + openid），被动回复 XML 兜底
 * - 发布：官方 API 图文草稿箱 + 发布
 */
@Injectable()
export class WechatMpAdapter implements ChannelAdapter {
  readonly platform = "wechat_mp";
  private readonly logger = new Logger(WechatMpAdapter.name);
  /** access_token 缓存：appid -> { token, expiresAt } */
  private tokenCache = new Map<string, { token: string; expiresAt: number }>();

  /** 公众号签名校验：SHA1(sort(token, timestamp, nonce))，payload 需含 timestamp/nonce */
  verifySignature(
    payload: unknown,
    signature: string,
    token: string,
  ): boolean {
    const data = (payload ?? {}) as Record<string, string | undefined>;
    return verifyWechatSignature(token, data?.timestamp ?? "", data?.nonce ?? "", signature);
  }

  /** 解析公众号 XML 入站消息（文本/事件） */
  parseInboundMessage(payload: unknown): InboundMessage | null {
    const xml = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
    const data = parseXmlObject(xml);
    const msgType = data.MsgType ?? "text";
    if (!data.FromUserName) return null;

    if (msgType === "event") {
      const event = data.Event ?? "";
      // 关注/扫码事件 → 记录订阅，无文本内容
      return {
        externalId: `wx_evt_${data.MsgId ?? Date.now()}`,
        senderExternalId: data.FromUserName,
        senderName: "微信用户",
        content: "",
        messageType: "event",
        rawPayload: data,
        sessionId: data.ToUserName,
      };
    }

    let content = "";
    if (msgType === "text") {
      content = data.Content ?? "";
    } else if (msgType === "image") {
      content = `[图片] ${data.PicUrl ?? ""}`;
    } else if (msgType === "voice") {
      content = `[语音] ${data.Recognition ?? ""}`;
    } else if (msgType === "link") {
      content = `[链接] ${data.Title ?? ""} ${data.Url ?? ""}`;
    } else {
      content = `[${msgType} 消息]`;
    }

    return {
      externalId: `wx_${data.MsgId ?? Date.now()}`,
      senderExternalId: data.FromUserName,
      senderName: "微信用户",
      content,
      messageType: msgType === "text" ? "text" : "event",
      rawPayload: data,
      sessionId: data.ToUserName,
    };
  }

  /** 发送客服消息（主动回复） */
  async sendMessage(
    credentials: string,
    message: OutboundMessage,
  ): Promise<{ success: boolean; externalId?: string; error?: string }> {
    const cfg = this.parseCredentials(credentials);
    if (!cfg?.appId || !cfg?.appSecret) {
      return { success: false, error: "未配置公众号 appId/appSecret" };
    }
    if (!message.targetExternalId) {
      return { success: false, error: "缺少接收者 openid（targetExternalId）" };
    }
    const accessToken = await this.getAccessToken(cfg.appId, cfg.appSecret);
    if (!accessToken) return { success: false, error: "获取公众号 access_token 失败" };
    try {
      const res = await fetch(
        `https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=${encodeURIComponent(accessToken)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            touser: message.targetExternalId,
            msgtype: "text",
            text: { content: String(message.content ?? "").slice(0, 2000) },
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (data?.errcode === 0) {
        this.logger.log(`[WechatMp] 客服消息发送成功: ${String(message.content ?? "").substring(0, 60)}`);
        return { success: true, externalId: `wx_reply_${Date.now()}` };
      }
      const err = `公众号客服消息失败: ${JSON.stringify(data ?? res.status)}`;
      this.logger.error(`[WechatMp] ${err}`);
      return { success: false, error: err };
    } catch (err) {
      this.logger.error(`[WechatMp] 客服消息异常: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  }

  /** 图文草稿箱 + 发布（官方 API：draft/add + freepublish/submit） */
  async publishContent(
    credentials: string,
    content: PublishContent,
  ): Promise<PublishResult> {
    const cfg = this.parseCredentials(credentials);
    if (!cfg?.appId || !cfg?.appSecret) {
      return { platform: "wechat_mp", success: false, error: "未配置公众号凭证" };
    }
    const accessToken = await this.getAccessToken(cfg.appId, cfg.appSecret);
    if (!accessToken) {
      return { platform: "wechat_mp", success: false, error: "获取 access_token 失败" };
    }
    try {
      const title = String(content.title ?? "");
      const text = String(content.content ?? "");
      const rawThumb = String(content.mediaUrls?.[0] ?? "").trim();
      if (!title) {
        return { platform: "wechat_mp", success: false, error: "缺少文章标题" };
      }
      if (!rawThumb) {
        return { platform: "wechat_mp", success: false, error: "缺少封面 media_id（mediaUrls[0]）" };
      }

      // F4：封面为外链时，先上传为永久素材换取 thumb_media_id；已是 media_id 则直接使用
      let thumbMediaId = rawThumb;
      if (/^https?:\/\//i.test(rawThumb)) {
        const uploaded = await this.uploadThumbMedia(accessToken, rawThumb);
        if (!uploaded.mediaId) {
          return { platform: "wechat_mp", success: false, error: uploaded.error ?? "封面素材上传失败" };
        }
        thumbMediaId = uploaded.mediaId;
      }
      const api = (path: string, body: unknown): Promise<Record<string, unknown> | null> =>
        fetch(`https://api.weixin.qq.com${path}?access_token=${encodeURIComponent(accessToken)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        }).then((r) => r.json().catch(() => null)) as Promise<Record<string, unknown> | null>;

      // 1) 图文草稿（草稿箱）：draft/add
      const draftData = await api("/cgi-bin/draft/add", {
        articles: [
          {
            title,
            author: String(cfg.author ?? ""),
            digest: String(content.tags?.[0] ?? ""),
            content: text,
            content_source_url: "",
            thumb_media_id: thumbMediaId,
            need_open_comment: 0,
            only_fans_can_comment: 0,
          },
        ],
      });
      if (draftData?.errcode && draftData.errcode !== 0) {
        return { platform: "wechat_mp", success: false, error: `建草稿失败: ${JSON.stringify(draftData)}` };
      }
      const mediaId = draftData?.media_id as string | undefined;
      if (!mediaId) {
        return { platform: "wechat_mp", success: false, error: "草稿箱未返回 media_id" };
      }

      // 2) 发布：freepublish/submit
      const pubData = await api("/cgi-bin/freepublish/submit", { media_id: mediaId });
      if (pubData?.errcode && pubData.errcode !== 0) {
        return { platform: "wechat_mp", success: false, error: `发布失败: ${JSON.stringify(pubData)}` };
      }
      return {
        platform: "wechat_mp",
        success: true,
        externalId: `wx_pub_${String(pubData?.publish_id ?? Date.now())}`,
      };
    } catch (err) {
      return { platform: "wechat_mp", success: false, error: (err as Error).message };
    }
  }

  /** 健康检查：尝试获取 access_token */
  async healthCheck(credentials: string): Promise<boolean> {
    const cfg = this.parseCredentials(credentials);
    if (!cfg?.appId || !cfg?.appSecret) return false;
    return Boolean(await this.getAccessToken(cfg.appId, cfg.appSecret));
  }

  /** 构造被动回复 XML（默认回复） */
  buildPassiveReply(toUser: string, fromUser: string, content: string): string {
    return serializeXml({
      ToUserName: toUser,
      FromUserName: fromUser,
      CreateTime: Math.floor(Date.now() / 1000),
      MsgType: "text",
      Content: content,
    });
  }

  /** 获取 access_token（带缓存，提前 5 分钟过期） */

  /**
   * 上传封面为公众号**永久图片素材**（material/add_material?type=image），返回 thumb_media_id。
   * 草稿箱的 thumb_media_id 只接受永久素材 id，因此外链封面必须先过这一跳。
   * 失败一律返回结构化 error，不抛异常（调用方据此返回 success:false）。
   */
  private async uploadThumbMedia(
    accessToken: string,
    imageUrl: string,
  ): Promise<{ mediaId?: string; error?: string }> {
    let bytes: ArrayBuffer;
    let contentType = "image/jpeg";
    try {
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
      if (!imgRes.ok) return { error: `封面图下载失败: HTTP ${imgRes.status}` };
      contentType = imgRes.headers?.get?.("content-type") || contentType;
      bytes = await imgRes.arrayBuffer();
    } catch (err) {
      return { error: `封面图下载异常: ${(err as Error).message}` };
    }
    if (!bytes || bytes.byteLength === 0) return { error: "封面图为空" };

    const form = new FormData();
    form.append("media", new Blob([bytes], { type: contentType }), "cover.jpg");
    try {
      const res = await fetch(
        `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${encodeURIComponent(accessToken)}&type=image`,
        { method: "POST", body: form, signal: AbortSignal.timeout(30000) },
      );
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (data?.errcode && data.errcode !== 0) {
        return { error: `上传封面素材失败: ${JSON.stringify(data)}` };
      }
      const mediaId = data?.media_id as string | undefined;
      if (!mediaId) return { error: "上传封面素材未返回 media_id" };
      return { mediaId };
    } catch (err) {
      return { error: `上传封面素材异常: ${(err as Error).message}` };
    }
  }
  private async getAccessToken(appId: string, appSecret: string): Promise<string | null> {
    const cached = this.tokenCache.get(appId);
    if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) return cached.token;
    try {
      const res = await fetch(
        `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}`,
        { signal: AbortSignal.timeout(15000) },
      );
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const token = data?.access_token as string | undefined;
      const expiresIn = Number(data?.expires_in ?? 7200);
      if (!token) {
        this.logger.error(`[WechatMp] access_token 获取失败: ${JSON.stringify(data)}`);
        return null;
      }
      this.tokenCache.set(appId, { token, expiresAt: Date.now() + expiresIn * 1000 });
      return token;
    } catch (err) {
      this.logger.error(`[WechatMp] access_token 异常: ${(err as Error).message}`);
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

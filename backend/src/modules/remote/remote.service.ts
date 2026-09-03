import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ChannelService } from "../channel/services/channel.service";
import { FeishuBotAdapter } from "../channel/adapters/feishu-bot.adapter";
import { WechatMpAdapter } from "../channel/adapters/wechat-mp.adapter";
import { WecomAdapter } from "../channel/adapters/wecom.adapter";
import { InboundMessage } from "../channel/adapters/channel-adapter.interface";
import { ChannelEntity } from "../channel/entities/channel.entity";
import { SyncGateway } from "../sync/sync.gateway";
import { AutomationService } from "../automation/automation.service";

/**
 * 自动化工作台 - 远程路由服务（阶段2：飞书/公众号/企业微信 入站 → 场景/命令路由 → 设备执行 → 结果回传）
 * 方案文档: 深瞳AI自动化工作台建设方案（代码内置版）B1/B2/B5/B7-lite/B6
 *
 * 绑定模型：复用 create_publish_channels 表
 *   - platform='feishu_bot'|'wechat_mp'|'wechat_work' 且 status='active' 的渠道即视为一条 IM 绑定
 *   - 飞书按 header.token 匹配渠道 webhookToken；公众号/企业微信按平台取最早激活渠道（单账号场景）
 * 意图分流（B7-lite）：
 *   1. 用户已启用场景实例命中（实例名/模板关键词）→ run_scenario 推送
 *   2. 本地命令关键词（查询状态/读取文件/执行系统命令等）→ 原文推送，桌面端解析
 *   3. 高危命令确认回复 → confirm 推送
 * 离线处理：直接回传"设备不在线"，不做离线队列
 */
/** 微信系 webhook 查询参数 */
interface WechatWebhookQuery {
  signature?: string;
  timestamp?: string;
  nonce?: string;
  echostr?: string;
  msgSignature?: string;
}

@Injectable()
export class RemoteService {
  private readonly logger = new Logger(RemoteService.name);

  /** 待确认命令（内存态，单实例部署适用；用户Id → { commandId, expiresAt }） */
  private pendingConfirmations = new Map<number, { commandId: string; expiresAt: number }>();

  /** 高危确认有效期（与桌面端一致：5 分钟） */
  private static readonly CONFIRM_TTL_MS = 5 * 60 * 1000;

  constructor(
    private readonly channelService: ChannelService,
    private readonly feishuAdapter: FeishuBotAdapter,
    private readonly wechatMpAdapter: WechatMpAdapter,
    private readonly wecomAdapter: WecomAdapter,
    private readonly syncGateway: SyncGateway,
    private readonly automationService: AutomationService,
  ) {
    // 订阅桌面端 remote:result 回传事件
    this.syncGateway.onRemoteResult((userId, payload) => {
      void this.handleResult(userId, payload).catch((err) => {
        this.logger.error(`[remote] 处理执行结果异常: ${(err as Error).message}`);
      });
    });
  }

  /** 健康检查 */
  health() {
    return { status: "ok", module: "remote", mode: "im-device-closed-loop" };
  }

  /** 按平台取最早激活渠道（单账号场景兜底） */
  private async findChannelByPlatform(
    platform: "feishu_bot" | "wechat_mp" | "wechat_work",
  ): Promise<ChannelEntity | null> {
    const list = await this.channelService.findActiveChannelsByPlatform(platform);
    return list[0] ?? null;
  }

  /**
   * 处理飞书 webhook 入站消息
   */
  async handleFeishuInbound(
    payload: unknown,
    signature?: string,
    timestamp?: string,
    rawBody?: string,
  ): Promise<{ ok: boolean; challenge?: string }> {
    const data = (payload ?? {}) as Record<string, any>;
    const wasEncrypted = typeof data?.encrypt === "string" && !!data.encrypt;

    const headerToken = data?.header?.token ?? data?.token;
    let channel: ChannelEntity | null = null;
    if (headerToken) {
      const matched = await this.channelService.findActiveChannelsByPlatform("feishu_bot");
      channel = matched.find((c) => c.webhookToken === headerToken) ?? null;
    }
    let effectivePayload: unknown = payload;
    let encryptKey = "";
    if (wasEncrypted) {
      // 加密回调：依次尝试各激活飞书渠道的 Encrypt Key，解密成功即命中该渠道
      const matchedChannels = await this.channelService.findActiveChannelsByPlatform("feishu_bot");
      const candidates = channel
        ? [channel]
        : matchedChannels.length
          ? matchedChannels
          : [await this.findChannelByPlatform("feishu_bot")].filter(Boolean) as ChannelEntity[];
      for (const cand of candidates) {
        const creds = this.channelService.decryptCredentials(cand);
        const key = creds?.encryptKey ?? "";
        if (!key) continue;
        const decrypted = this.feishuAdapter.decryptPayload(payload, key);
        if (decrypted) {
          channel = cand;
          effectivePayload = decrypted;
          encryptKey = key;
          break;
        }
      }
      if (!channel || !encryptKey) {
        this.logger.warn("[remote] 收到飞书加密回调，但没有渠道能解密（检查 Encrypt Key 是否已配置）");
        return { ok: false };
      }
    } else if (!channel) {
      channel = await this.findChannelByPlatform("feishu_bot");
    }
    if (!channel) {
      this.logger.warn("[remote] 无已激活的飞书渠道绑定，忽略入站消息（请在渠道管理中配置飞书机器人）");
      return { ok: false };
    }

    const effective = (effectivePayload ?? {}) as Record<string, any>;
    if (effective?.type === "url_verification" && typeof effective?.challenge === "string") {
      this.logger.log(`[remote] 飞书 url_verification 收到挑战 encrypted=${wasEncrypted} channel=${channel?.id}`);
      return { ok: true, challenge: effective.challenge };
    }

    const inbound = this.feishuAdapter.parseInboundMessage(effectivePayload);
    if (!inbound) {
      this.logger.warn("[remote] 无法解析飞书入站消息（事件类型可能不支持）");
      return { ok: false };
    }

    // 飞书开放平台事件签名：密钥为 app_secret；自定义机器人用 webhookToken。两者都试，任一通过即可。
    const creds = this.channelService.decryptCredentials(channel) ?? {};
    const signKeys = [creds.appSecret, channel.webhookToken].filter(Boolean) as string[];
    const sigOk = signKeys.some((k) =>
      this.feishuAdapter.verifySignature(payload, signature ?? "", k, timestamp, rawBody),
    );
    if (!sigOk) {
      this.logger.warn("[remote] 飞书签名校验失败（appSecret/webhookToken 均不匹配），拒绝处理");
      return { ok: false };
    }

    return this.routeInboundMessage(channel, inbound);
  }

  /**
   * 处理公众号 webhook（GET 验证回显 echostr / POST XML 消息）
   */
  async handleWechatMpInbound(
    payload: unknown,
    query: WechatWebhookQuery,
  ): Promise<{ ok: boolean; echostr?: string }> {
    // GET 验证：签名通过才回显 echostr
    if (typeof query?.echostr === "string" && query.echostr) {
      const channel = await this.findChannelByPlatform("wechat_mp");
      const token = channel?.webhookToken ?? "";
      const ok = this.wechatMpAdapter.verifySignature(query, query.signature ?? "", token);
      return { ok, echostr: ok ? query.echostr : undefined };
    }

    // POST 消息（XML 原始体）
    const inbound = this.wechatMpAdapter.parseInboundMessage(payload);
    if (!inbound) {
      this.logger.warn("[remote] 无法解析公众号入站消息");
      return { ok: false };
    }
    const channel = await this.findChannelByPlatform("wechat_mp");
    if (!channel) {
      this.logger.warn("[remote] 无已激活的公众号渠道绑定，忽略入站消息");
      return { ok: false };
    }
    // 验签（channel.webhookToken = 公众号 Token）
    if (
      channel.webhookToken &&
      !this.wechatMpAdapter.verifySignature(query, query.signature ?? "", channel.webhookToken)
    ) {
      this.logger.warn("[remote] 公众号签名校验失败，拒绝处理");
      return { ok: false };
    }
    // 关注/取关等事件：仅记录，不路由
    if (inbound.messageType === "event" || !inbound.content?.trim()) {
      return { ok: true };
    }
    return this.routeInboundMessage(channel, inbound);
  }

  /**
   * 处理企业微信回调（GET 验证 / POST 加密事件）
   */
  async handleWecomInbound(
    payload: unknown,
    query: WechatWebhookQuery,
  ): Promise<{ ok: boolean; echostr?: string }> {
    const channel = await this.findChannelByPlatform("wechat_work");
    if (!channel) {
      this.logger.warn("[remote] 无已激活的企业微信渠道绑定，忽略回调（请先在渠道管理中配置企业微信）");
      return { ok: false };
    }
    const token = channel.webhookToken ?? "";

    // GET 验证：msg_signature 校验通过后解密 echostr 回显
    if (typeof query?.echostr === "string" && query.echostr) {
      const ok = this.wecomAdapter.verifySignature(
        { timestamp: query.timestamp, nonce: query.nonce, encrypt: query.echostr },
        query.msgSignature ?? "",
        token,
      );
      if (!ok) {
        this.logger.warn("[remote] 企业微信 GET 验签失败");
        return { ok: false };
      }
      const creds = this.channelService.decryptCredentials(channel);
      const aesKey = creds?.encodingAesKey ?? "";
      if (aesKey) {
        try {
          const { message } = this.wecomAdapter.decryptPayload({ encrypt: query.echostr }, aesKey);
          return { ok: true, echostr: message };
        } catch (err) {
          this.logger.warn(`[remote] 企业微信 echostr 解密失败: ${(err as Error).message}`);
          return { ok: false };
        }
      }
      return { ok: true, echostr: query.echostr };
    }

    // POST 事件回调：body 为 { Encrypt: "..." }（JSON 或原始体）
    let encrypt = (payload as Record<string, any>)?.Encrypt as string | undefined;
    if (!encrypt) {
      const raw = typeof payload === "string" ? payload : JSON.stringify(payload ?? {});
      try {
        encrypt = (JSON.parse(raw) as Record<string, any>)?.Encrypt as string | undefined;
      } catch {
        encrypt = undefined;
      }
    }
    if (!encrypt) {
      this.logger.warn("[remote] 企业微信回调缺少 Encrypt 字段");
      return { ok: false };
    }

    // 验签：msg_signature = SHA1(sort(token, timestamp, nonce, encrypt))
    const ok = this.wecomAdapter.verifySignature(
      { timestamp: query.timestamp, nonce: query.nonce, encrypt },
      query.msgSignature ?? "",
      token,
    );
    if (!ok) {
      this.logger.warn("[remote] 企业微信签名校验失败，拒绝处理");
      return { ok: false };
    }

    // 解密 → 解析 → 路由
    const creds = this.channelService.decryptCredentials(channel);
    let message: string;
    try {
      const decrypted = this.wecomAdapter.decryptPayload({ encrypt }, creds?.encodingAesKey ?? "");
      message = decrypted.message;
    } catch (err) {
      this.logger.warn(`[remote] 企业微信消息解密失败: ${(err as Error).message}`);
      return { ok: false };
    }
    const inbound = this.wecomAdapter.parseInboundMessage(message);
    if (!inbound) {
      this.logger.warn("[remote] 无法解析企业微信入站消息");
      return { ok: false };
    }
    if (inbound.messageType === "event" || !inbound.content?.trim()) {
      return { ok: true };
    }
    return this.routeInboundMessage(channel, inbound);
  }

  /**
   * 公共路由：文本指令 → 确认回复 → 在线检查 → 场景分流 → 命令推送
   */
  private async routeInboundMessage(
    channel: ChannelEntity,
    inbound: InboundMessage,
  ): Promise<{ ok: boolean }> {
    // 仅处理文本指令
    const text = inbound.content?.trim() ?? "";
    if (inbound.messageType !== "text" || !text) {
      if (inbound.messageType !== "text") {
        await this.replyText(channel, inbound.senderExternalId, "当前只支持文字指令，图片/文件消息暂不处理");
      }
      return { ok: true };
    }

    const replyContext = {
      channelId: channel.id,
      senderExternalId: inbound.senderExternalId,
      sessionId: inbound.sessionId ?? null,
    };

    // 高危确认回复（用户回复"确认"执行待确认命令）
    const pending = this.pendingConfirmations.get(channel.userId);
    if (pending && this.isConfirmationText(text)) {
      this.pendingConfirmations.delete(channel.userId);
      this.logger.log(`[remote] 收到确认回复，放行命令 ${pending.commandId}`);
      const commandId = this.pushCommand(channel, inbound, replyContext, {
        confirm: true,
        confirmCommandId: pending.commandId,
      });
      await this.automationService.logAudit(channel.userId, {
        commandId,
        direction: "confirm",
        command: text,
        commandType: "confirm",
        status: "routed",
        replyContext,
      });
      return { ok: true };
    }

    // 设备在线检查
    const online = await this.syncGateway.isUserOnline(channel.userId);
    if (!online) {
      await this.automationService.logAudit(channel.userId, {
        direction: "in",
        command: text,
        status: "offline",
        replyContext,
      });
      await this.replyText(
        channel,
        inbound.senderExternalId,
        "你的设备当前不在线，无法执行指令。请先打开桌面端深瞳AI并保持运行。",
      );
      return { ok: true };
    }

    // 意图分流 1：场景实例命中 → run_scenario
    const match = await this.automationService.matchInstance(channel.userId, text);
    if (match) {
      await this.automationService.markInstanceRun(channel.userId, match.instance.id);
      const commandId = this.pushCommand(channel, inbound, replyContext, {
        type: "run_scenario",
        payload: {
          instanceId: match.instance.id,
          steps: match.steps,
          params: match.instance.params ?? {},
        },
        instanceId: match.instance.id,
        // D2：场景绑定指定设备时，命令只允许该设备执行
        targetDeviceId: match.instance.deviceId ?? undefined,
      });
      await this.automationService.logAudit(channel.userId, {
        commandId,
        instanceId: match.instance.id,
        direction: "in",
        command: text,
        commandType: "run_scenario",
        status: "routed",
        replyContext,
      });
      this.logger.log(
        `[remote] 场景命中「${match.instance.name}」(instance=${match.instance.id})，推送 run_scenario ${commandId}`,
      );
      return { ok: true };
    }

    // 意图分流 2：本地命令关键词 → 原文推送，桌面端 parseCommand 解析
    const commandId = this.pushCommand(channel, inbound, replyContext, {});
    await this.automationService.logAudit(channel.userId, {
      commandId,
      direction: "in",
      command: text,
      commandType: "command",
      status: "routed",
      replyContext,
    });
    return { ok: true };
  }

  /**
   * 处理桌面端回传的执行结果（remote:result）
   * 高危需确认时记录 pendingConfirmations，等待用户 IM 回复"确认"
   */
  async handleResult(userId: number, payload: unknown): Promise<void> {
    const data = (payload ?? {}) as Record<string, any>;
    const commandId = String(data?.commandId ?? "").trim();
    const status = String(data?.status ?? "").trim();
    if (!commandId || !status) {
      this.logger.warn(`[remote] 忽略无效结果（userId=${userId}）`);
      return;
    }

    if (status === "need_confirmation") {
      this.pendingConfirmations.set(userId, {
        commandId,
        expiresAt: Date.now() + RemoteService.CONFIRM_TTL_MS,
      });
    } else {
      this.pendingConfirmations.delete(userId);
    }

    const replyContext = (data?.replyContext ?? {}) as Record<string, any>;
    const channelId = replyContext?.channelId ? Number(replyContext.channelId) : null;
    const senderExternalId = String(replyContext?.senderExternalId ?? "").trim();
    if (!senderExternalId) return;

    // 回传渠道：优先按命令携带的 channelId，兜底取该用户最早激活的飞书渠道
    let channel: ChannelEntity | null = null;
    if (channelId) {
      channel = await this.channelService
        .getChannel(userId, channelId)
        .catch(() => null);
    }
    if (!channel) {
      const owned = await this.channelService.findActiveChannelsByPlatformForUser("feishu_bot", userId);
      channel = owned[0] ?? null;
    }
    if (!channel) return;

    const replyText = this.formatResult(status, data);
    await this.replyText(channel, senderExternalId, replyText);

    // 审计
    await this.automationService.logAudit(userId, {
      commandId,
      direction: "result",
      commandType: data?.commandType ? String(data.commandType) : undefined,
      status,
      message: replyText,
      replyContext,
      deviceId: data?.deviceId ? String(data.deviceId) : undefined,
    });
  }

  /**
   * 推送命令到用户在线设备
   * @returns 生成的 commandId
   */
  private pushCommand(
    channel: ChannelEntity,
    inbound: { senderExternalId: string; sessionId?: string; content?: string },
    replyContext: { channelId: number; senderExternalId: string; sessionId: string | null },
    extra: Record<string, unknown>,
  ): string {
    const commandId = randomUUID();
    this.syncGateway.pushToUser(channel.userId, "remote:command", {
      commandId,
      text: inbound.content?.trim() ?? "",
      source: "feishu",
      ...extra,
      replyContext,
    });
    this.logger.log(
      `[remote] 推送命令 ${commandId} -> user:${channel.userId}: ${(inbound.content ?? "").trim().substring(0, 80)}`,
    );
    return commandId;
  }

  /** 回传文本消息到 IM（按渠道平台选择适配器） */
  private async replyText(
    channel: ChannelEntity,
    senderExternalId: string,
    content: string,
  ): Promise<void> {
    if (!content) return;
    const creds = this.channelService.decryptCredentials(channel);
    const credentialsJson = JSON.stringify({
      ...(creds ?? {}),
      webhookToken: channel.webhookToken ?? undefined,
      webhookUrl: channel.webhookUrl ?? undefined,
    });
    let result: { success: boolean; externalId?: string; error?: string };
    if (channel.platform === "wechat_mp") {
      result = await this.wechatMpAdapter.sendMessage(credentialsJson, {
        targetExternalId: senderExternalId,
        content,
      });
    } else if (channel.platform === "wechat_work") {
      result = await this.wecomAdapter.sendMessage(credentialsJson, {
        targetExternalId: senderExternalId,
        content,
      });
    } else {
      result = await this.feishuAdapter.sendMessage(credentialsJson, {
        targetExternalId: senderExternalId,
        content,
      });
    }
    if (!result.success) {
      this.logger.error(`[remote] IM 回传失败: ${result.error}`);
    }
  }

  /** 判断是否为确认回复 */
  private isConfirmationText(text: string): boolean {
    const normalized = text.replace(/\s+/g, "").toLowerCase();
    return ["确认", "确认执行", "同意", "执行", "confirm", "yes", "y"].includes(normalized);
  }

  /** 格式化执行结果为 IM 文本 */
  private formatResult(status: string, data: Record<string, any>): string {
    const message = String(data?.message ?? "").trim();
    const detail = this.summarizeData(data?.data);
    switch (status) {
      case "running":
        return `▶️ 已开始执行${message ? `：${message}` : ""}`;
      case "success":
        return `✅ 执行完成${message ? `：${message}` : ""}${detail ? `\n${detail}` : ""}`;
      case "failed":
        return `❌ 执行失败${message ? `：${message}` : ""}`;
      case "need_confirmation":
        return `${message || "该操作需要确认"}（回复「确认」执行，5 分钟内有效）`;
      default:
        return message || `状态：${status}`;
    }
  }

  /** 摘要输出执行数据（避免超长回传） */
  private summarizeData(data: unknown): string {
    if (data === undefined || data === null) return "";
    try {
      const text = typeof data === "string" ? data : JSON.stringify(data);
      const trimmed = text.length > 800 ? `${text.substring(0, 800)}…（已截断）` : text;
      return trimmed ? `数据：${trimmed}` : "";
    } catch {
      return "";
    }
  }
}

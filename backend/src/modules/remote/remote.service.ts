import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ChannelService } from "../channel/services/channel.service";
import { FeishuBotAdapter } from "../channel/adapters/feishu-bot.adapter";
import { ChannelEntity } from "../channel/entities/channel.entity";
import { SyncGateway } from "../sync/sync.gateway";
import { AutomationService } from "../automation/automation.service";

/**
 * 自动化工作台 - 远程路由服务（阶段1：飞书入站 → 场景/命令路由 → 设备执行 → 结果回传）
 * 方案文档: 深瞳AI自动化工作台建设方案（代码内置版）B1/B2/B5/B7-lite/B6
 *
 * 绑定模型：复用 create_publish_channels 表
 *   - platform='feishu_bot' 且 status='active' 的渠道即视为一条 IM 绑定
 *   - 入站按 header.token（飞书应用验证 token）匹配渠道 webhookToken；未匹配时取最早激活渠道
 * 意图分流（B7-lite）：
 *   1. 用户已启用场景实例命中（实例名/模板关键词）→ run_scenario 推送
 *   2. 本地命令关键词（查询状态/读取文件/执行系统命令等）→ 原文推送，桌面端解析
 *   3. 高危命令确认回复 → confirm 推送
 * 离线处理：直接回传"设备不在线"，不做离线队列
 */
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
    return { status: "ok", module: "remote", mode: "feishu-device-closed-loop" };
  }

  /**
   * 处理飞书 webhook 入站消息
   * @returns ok=false 表示无绑定/非文本消息（无需回执）；ok=true 表示已处理
   */
  async handleFeishuInbound(
    payload: unknown,
    signature?: string,
    timestamp?: string,
  ): Promise<{ ok: boolean }> {
    const inbound = this.feishuAdapter.parseInboundMessage(payload);
    if (!inbound) {
      this.logger.warn("[remote] 无法解析飞书入站消息（事件类型可能不支持）");
      return { ok: false };
    }

    // 绑定匹配：优先用飞书事件 header.token 精确匹配渠道 webhookToken，支持多机器人多用户
    const headerToken = (payload as Record<string, any>)?.header?.token as string | undefined;
    let channel: ChannelEntity | null = null;
    if (headerToken) {
      const matched = await this.channelService.findActiveChannelsByPlatform("feishu_bot");
      channel = matched.find((c) => c.webhookToken === headerToken) ?? null;
    }
    // 兜底：取最早激活的飞书渠道（单用户单机器人场景）
    if (!channel) {
      const fallback = await this.channelService.findActiveChannelsByPlatform("feishu_bot");
      channel = fallback[0] ?? null;
    }
    if (!channel) {
      this.logger.warn("[remote] 无已激活的飞书渠道绑定，忽略入站消息（请在渠道管理中配置飞书机器人）");
      return { ok: false };
    }

    // 验签（webhookToken 已配置时强制校验）
    if (
      channel.webhookToken &&
      !this.feishuAdapter.verifySignature(payload, signature ?? "", channel.webhookToken, timestamp)
    ) {
      this.logger.warn("[remote] 飞书签名校验失败，拒绝处理");
      return { ok: false };
    }

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

  /** 回传文本消息到飞书 */
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
    const result = await this.feishuAdapter.sendMessage(credentialsJson, {
      targetExternalId: senderExternalId,
      content,
    });
    if (!result.success) {
      this.logger.error(`[remote] 飞书回传失败: ${result.error}`);
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
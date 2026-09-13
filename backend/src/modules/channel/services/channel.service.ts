import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChannelEntity } from "../entities/channel.entity";
import { EncryptionService } from "../../../common/services/encryption.service";
import { isKnownChannelPlatform } from "../channel-platforms";
import { ChannelAdapterRegistry } from "../channel-adapter.registry";

@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  constructor(
    @InjectRepository(ChannelEntity)
    private readonly channelRepo: Repository<ChannelEntity>,
    private readonly encryptionService: EncryptionService,
    private readonly adapterRegistry: ChannelAdapterRegistry,
  ) {}

  /**
   * 测试渠道连接：静态校验凭证完整性 + 调对应适配器 healthCheck。
   * 不修改任何状态，仅供设置页/渠道详情页「测试连接」按钮使用。
   */
  async testConnection(
    userId: number,
    channelId: number,
  ): Promise<{ ok: boolean; online: boolean; message: string; platform: string }> {
    const channel = await this.getChannel(userId, channelId);
    const platform = channel.platform;
    const creds = this.decryptCredentials(channel);

    // 入站回调类渠道：Webhook Token 也视为一种凭证
    const merged: Record<string, string> = { ...(creds ?? {}) };
    if (channel.webhookToken) merged.webhookToken = channel.webhookToken;

    const staticErr = this.adapterRegistry.validateCredentials(platform, merged);
    if (staticErr) {
      return { ok: true, online: false, message: staticErr, platform };
    }

    const adapter = this.adapterRegistry.get(platform);
    if (!adapter) {
      // 扫码发布平台：无法在服务端验证，返回中性提示
      return {
        ok: true,
        online: false,
        message: "扫码发布平台需在桌面端验证登录态",
        platform,
      };
    }

    try {
      const online = await adapter.healthCheck(JSON.stringify(merged));
      return {
        ok: true,
        online,
        message: online ? "连接正常" : "凭证校验未通过，请检查配置",
        platform,
      };
    } catch (err) {
      return {
        ok: true,
        online: false,
        message: `连接测试异常: ${(err as Error).message}`,
        platform,
      };
    }
  }


  /** 查询已激活的渠道（按平台，用于 IM 绑定路由；创建时间升序取最早绑定） */
  async findActiveChannelsByPlatform(platform: string): Promise<ChannelEntity[]> {
    return this.channelRepo.find({
      where: { platform: platform as ChannelEntity["platform"], status: "active" },
      order: { createdAt: "ASC" },
    });
  }

  /** 查询某用户已激活的渠道（按平台） */
  async findActiveChannelsByPlatformForUser(
    platform: string,
    userId: number,
  ): Promise<ChannelEntity[]> {
    return this.channelRepo.find({
      where: { platform: platform as ChannelEntity["platform"], status: "active", userId },
      order: { createdAt: "ASC" },
    });
  }

  /**
   * 规范化账号 ID：小写、非法字符转 -、去首尾 -、限长 64、空则 default。
   * 与 RRClaw 的账号 ID 规则对齐；用于同一平台下挂多个账号（各自绑定不同 Agent）。
   */
  normalizeAccountId(raw?: string | null): string {
    const s = String(raw ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!s) return "default";
    return s.slice(0, 64);
  }

  health() {
    return { status: "ok", module: "channel" };
  }

  async listChannels(userId: number): Promise<ChannelEntity[]> {
    return this.channelRepo.find({
      where: { userId },
      order: { createdAt: "DESC" },
    });
  }

  async getChannel(userId: number, channelId: number): Promise<ChannelEntity> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId, userId },
    });
    if (!channel) throw new NotFoundException("渠道不存在");
    return channel;
  }

  async createChannel(
    userId: number,
    data: {
      name: string;
      platform: string;
      direction: "input" | "output" | "both";
      credentials?: Record<string, string>;
      webhookUrl?: string;
      webhookToken?: string;
      teamId?: number;
      agentId?: number;
      agentRef?: string;
      accountId?: string;
    },
  ): Promise<ChannelEntity> {
    if (!isKnownChannelPlatform(data.platform)) {
      throw new BadRequestException(`不支持的渠道平台: ${data.platform}`);
    }
    const accountId = this.normalizeAccountId(data.accountId);
    // 同平台同账号唯一：避免重复接入同一账号导致回调路由错乱
    const dup = await this.channelRepo.findOne({
      where: { userId, platform: data.platform, accountId },
    });
    if (dup) {
      throw new BadRequestException(`该账号已存在（平台 ${data.platform} / 账号 ${accountId}）`);
    }
    const channel = this.channelRepo.create({
      userId,
      name: data.name,
      platform: data.platform,
      direction: data.direction,
      credentials: data.credentials
        ? this.encryptionService.encryptAes(JSON.stringify(data.credentials))
        : undefined,
      webhookUrl: data.webhookUrl,
      webhookToken: data.webhookToken,
      teamId: data.teamId,
      agentId: data.agentId,
      agentRef: data.agentRef ?? undefined,
      accountId,
      status: "active",
    });
    return this.channelRepo.save(channel);
  }

  async updateChannel(
    userId: number,
    channelId: number,
    data: Partial<{
      name: string;
      direction: "input" | "output" | "both";
      status: "active" | "disabled";
      credentials: Record<string, string>;
      webhookUrl: string;
      webhookToken: string;
      teamId: number;
      agentId: number;
      agentRef: string;
      accountId: string;
    }>,
  ): Promise<ChannelEntity> {
    const channel = await this.getChannel(userId, channelId);

    if (data.name !== undefined) channel.name = data.name;
    if (data.direction !== undefined) channel.direction = data.direction;
    if (data.status !== undefined) channel.status = data.status;
    if (data.webhookUrl !== undefined) channel.webhookUrl = data.webhookUrl;
    if (data.webhookToken !== undefined) channel.webhookToken = data.webhookToken;
    if (data.teamId !== undefined) channel.teamId = data.teamId;
    if (data.agentId !== undefined) channel.agentId = data.agentId;
    if (data.agentRef !== undefined) channel.agentRef = data.agentRef;
    if (data.accountId !== undefined) {
      const accountId = this.normalizeAccountId(data.accountId);
      if (accountId !== channel.accountId) {
        const dup = await this.channelRepo.findOne({
          where: { userId, platform: channel.platform, accountId },
        });
        if (dup) throw new BadRequestException(`该账号已存在（账号 ${accountId}）`);
      }
      channel.accountId = accountId;
    }
    if (data.credentials) {
      // 合并更新：保留已有 appId/appSecret 等，只覆盖本次传入字段；
      // 空字符串视为清除该字段，避免保存 encryptKey 时把其它凭证抹掉
      const existing = this.decryptCredentials(channel) ?? {};
      const merged = { ...existing, ...data.credentials };
      for (const k of Object.keys(merged)) {
        if (merged[k] === "") delete merged[k];
      }
      channel.credentials = this.encryptionService.encryptAes(JSON.stringify(merged));
    }

    return this.channelRepo.save(channel);
  }

  async deleteChannel(userId: number, channelId: number): Promise<void> {
    const channel = await this.getChannel(userId, channelId);
    await this.channelRepo.delete({ id: channel.id });
  }

  /** 解密凭证 */
  decryptCredentials(channel: ChannelEntity): Record<string, string> | null {
    if (!channel.credentials) return null;
    try {
      return JSON.parse(this.encryptionService.decryptAes(channel.credentials));
    } catch {
      return null;
    }
  }
}

import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChannelEntity } from "../entities/channel.entity";
import { EncryptionService } from "../../../common/services/encryption.service";

@Injectable()
export class ChannelService {
  private readonly logger = new Logger(ChannelService.name);

  constructor(
    @InjectRepository(ChannelEntity)
    private readonly channelRepo: Repository<ChannelEntity>,
    private readonly encryptionService: EncryptionService,
  ) {}

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
    },
  ): Promise<ChannelEntity> {
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
    if (data.credentials) {
      channel.credentials = this.encryptionService.encryptAes(
        JSON.stringify(data.credentials),
      );
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

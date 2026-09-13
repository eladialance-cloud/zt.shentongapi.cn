import { Injectable } from "@nestjs/common";
import { ChannelAdapter } from "./adapters/channel-adapter.interface";
import { FeishuBotAdapter } from "./adapters/feishu-bot.adapter";
import { WechatMpAdapter } from "./adapters/wechat-mp.adapter";
import { WecomAdapter } from "./adapters/wecom.adapter";
import { DingtalkBotAdapter } from "./adapters/dingtalk-bot.adapter";
import { TelegramBotAdapter } from "./adapters/telegram-bot.adapter";
import { WecomBotAdapter } from "./adapters/wecom-bot.adapter";
import { QqBotAdapter } from "./adapters/qq-bot.adapter";
import { ChannelPlatformMeta, getChannelPlatformMeta } from "./channel-platforms";

/**
 * 各平台「必需」凭证字段（服务端校验真源）
 *
 * 注册表里的 credentialFields 是「可填写字段」（含可选，如钉钉加签密钥、
 * 微信 EncodingAESKey），但真正发请求前必须有的只有下列字段。
 * 字段值支持别名数组：任一别名有值即视为已提供。
 */
const REQUIRED_CREDENTIALS: Record<string, Array<string | string[]>> = {
  wechat_mp: ["appId", "appSecret"],
  wechat_work: ["corpId", "corpSecret", "agentId"],
  feishu_bot: [["appId", "webhookToken", "token"]],
  dingtalk_bot: [["webhookToken", "token", "accessToken"]],
  telegram_bot: [["botToken", "token"]],
  wecom_bot: [["webhookUrl", "key", "webhookToken"]],
  qq_bot: ["appId", "appSecret"],
};

/** 取字段的展示名（用于缺字段提示） */
function labelOf(platform: string, key: string): string {
  const meta = getChannelPlatformMeta(platform);
  return meta?.credentialFields?.find((f) => f.key === key)?.label ?? key;
}

/**
 * 渠道适配器注册表（唯一真源）
 *
 * 渲染层「测试连接」与入站路由都从这里按 platform 取适配器，
 * 避免在多个文件里各写一份 platform → adapter 映射导致漂移。
 */
@Injectable()
export class ChannelAdapterRegistry {
  private readonly adapters: Map<string, ChannelAdapter>;

  constructor(
    private readonly feishuBot: FeishuBotAdapter,
    private readonly wechatMp: WechatMpAdapter,
    private readonly wecom: WecomAdapter,
    private readonly dingtalkBot: DingtalkBotAdapter,
    private readonly telegramBot: TelegramBotAdapter,
    private readonly wecomBot: WecomBotAdapter,
    private readonly qqBot: QqBotAdapter,
  ) {
    this.adapters = new Map<string, ChannelAdapter>([
      [this.feishuBot.platform, this.feishuBot],
      [this.wechatMp.platform, this.wechatMp],
      [this.wecom.platform, this.wecom],
      [this.dingtalkBot.platform, this.dingtalkBot],
      [this.telegramBot.platform, this.telegramBot],
      [this.wecomBot.platform, this.wecomBot],
      [this.qqBot.platform, this.qqBot],
    ]);
  }

  /** 取适配器（发布平台无适配器，返回 undefined） */
  get(platform: string): ChannelAdapter | undefined {
    return this.adapters.get(platform);
  }

  has(platform: string): boolean {
    return this.adapters.has(platform);
  }

  /** 已接入适配器的平台列表 */
  listPlatforms(): string[] {
    return [...this.adapters.keys()];
  }

  /**
   * 凭证完整性检查（不发起网络请求的静态校验）
   * 用于「测试连接」的前置：字段缺失直接给出可操作提示，避免无谓请求。
   */
  validateCredentials(platform: string, credentials: Record<string, string> | null): string | null {
    const meta: ChannelPlatformMeta | undefined = getChannelPlatformMeta(platform);
    if (!meta) return `未知平台: ${platform}`;
    if (!this.adapters.has(platform)) {
      return meta.category === "publish"
        ? `${meta.label} 为扫码发布平台，登录态在桌面端本地会话中维护`
        : `${meta.label} 暂不支持服务端连接测试`;
    }
    const required = REQUIRED_CREDENTIALS[platform];
    if (!required) return null;
    const creds = credentials ?? {};
    const missing = required
      .filter((rule) => {
        const aliases = Array.isArray(rule) ? rule : [rule];
        return !aliases.some((k) => Boolean(creds[k]));
      })
      .map((rule) => labelOf(platform, Array.isArray(rule) ? rule[0] : rule));
    if (missing.length > 0) return `缺少凭证字段: ${missing.join("、")}`;
    return null;
  }
}

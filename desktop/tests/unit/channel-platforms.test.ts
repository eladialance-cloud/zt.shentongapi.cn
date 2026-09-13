/** 渠道平台注册表 + 账号规范化 + 绑定描述（频道增强）单元测试 */
import {
  CHANNEL_PLATFORMS,
  CHANNEL_IM_PLATFORMS,
  CHANNEL_PUBLISH_PLATFORMS,
  PLATFORM_LABELS,
  getChannelPlatformMeta,
  normalizeAccountId,
  describeAgentBinding,
  channelWebhookPath,
  supportsChannelWebhook,
  isDesktopDrivenPublishPlatform,
} from "@/types/channel";

describe("channel 平台注册表", () => {
  it("登记 15 个平台且含分类标记", () => {
    expect(CHANNEL_PLATFORMS.length).toBeGreaterThanOrEqual(15);
    expect(CHANNEL_PLATFORMS.every((p) => p.label && p.emoji && p.connectionType && p.category)).toBe(true);
    expect(CHANNEL_IM_PLATFORMS.length).toBeGreaterThanOrEqual(7);
    expect(CHANNEL_PUBLISH_PLATFORMS.length).toBeGreaterThanOrEqual(8);
  });

  it("平台 id 唯一", () => {
    const ids = CHANNEL_PLATFORMS.map((p) => p.platform);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("入站消息渠道与发布平台齐全", () => {
    // IM：微信公众号/企业微信/飞书/钉钉/Telegram/企业微信群机器人/QQ
    for (const id of ["wechat_mp", "wechat_work", "feishu_bot", "dingtalk_bot", "telegram_bot", "wecom_bot", "qq_bot"]) {
      expect(getChannelPlatformMeta(id)?.category).toBe("im");
    }
    // 发布：抖音/快手/小红书/B站/西瓜/视频号/微博/知乎
    for (const id of ["douyin", "kuaishou", "xiaohongshu", "bilibili", "xigua", "wx_channels", "weibo", "zhihu"]) {
      expect(getChannelPlatformMeta(id)?.category).toBe("publish");
    }
  });

  it("发布平台均为扫码会话驱动且带主页/发布页", () => {
    for (const p of CHANNEL_PUBLISH_PLATFORMS) {
      expect(p.connectionType).toBe("qr");
      expect(p.inbound).toBe(false);
      expect(p.homeUrl).toMatch(/^https:\/\//);
      expect(p.publishUrl).toMatch(/^https:\/\//);
      expect(isDesktopDrivenPublishPlatform(p.platform)).toBe(true);
    }
    expect(isDesktopDrivenPublishPlatform("feishu_bot")).toBe(false);
  });

  it("PLATFORM_LABELS 覆盖所有平台", () => {
    for (const p of CHANNEL_PLATFORMS) {
      expect(PLATFORM_LABELS[p.platform]).toBeDefined();
    }
  });

  it("getChannelPlatformMeta 命中/未命中", () => {
    expect(getChannelPlatformMeta("wechat_mp")?.inbound).toBe(true);
    expect(getChannelPlatformMeta("nope")).toBeUndefined();
  });

  it("凭证字段 key 唯一", () => {
    for (const p of CHANNEL_PLATFORMS) {
      const keys = p.credentialFields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("IM 渠道均有接入指引与描述", () => {
    for (const p of CHANNEL_IM_PLATFORMS) {
      expect(p.description.length).toBeGreaterThan(0);
      expect(p.instructions.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeAccountId", () => {
  it("空值回退 default", () => {
    expect(normalizeAccountId("")).toBe("default");
    expect(normalizeAccountId(null)).toBe("default");
    expect(normalizeAccountId("   ")).toBe("default");
  });
  it("小写化 + 非法字符转连字符 + 去首尾", () => {
    expect(normalizeAccountId("Feishu-Sales Bot")).toBe("feishu-sales-bot");
    expect(normalizeAccountId("-abc-")).toBe("abc");
  });
  it("限长 64", () => {
    expect(normalizeAccountId("a".repeat(100)).length).toBe(64);
  });
});

describe("describeAgentBinding", () => {
  it("官署 id 优先", () => {
    expect(describeAgentBinding("bingbu")).toBe("绑定对象：bingbu");
  });
  it("无官署退回 agentId", () => {
    expect(describeAgentBinding(null, 7)).toBe("绑定对象：#7");
  });
  it("都无 → 未绑定", () => {
    expect(describeAgentBinding(null, null)).toBe("未绑定");
  });
});

describe("webhook 路径", () => {
  it("已实现回调的平台返回路径", () => {
    expect(channelWebhookPath("feishu_bot")).toContain("/webhook/feishu");
    expect(supportsChannelWebhook("wechat_mp")).toBe(true);
    expect(channelWebhookPath("dingtalk_bot")).toContain("/webhook/dingtalk");
    expect(channelWebhookPath("telegram_bot")).toContain("/webhook/telegram");
    expect(channelWebhookPath("qq_bot")).toContain("/webhook/qq");
  });
  it("仅出站/发布平台无回调路径", () => {
    expect(channelWebhookPath("wecom_bot")).toBeFalsy();
    expect(supportsChannelWebhook("douyin")).toBe(false);
    expect(supportsChannelWebhook("wecom_bot")).toBe(false);
  });
});

// 渠道回调地址映射单测：映射表必须与后端真实路由一致
// 后端路由：backend/src/modules/remote/remote.controller.ts（@Controller("remote")）
import {
  CHANNEL_WEBHOOK_PATHS,
  CHANNEL_WEBHOOK_METHODS,
  channelWebhookPath,
  channelWebhookMethod,
  supportsChannelWebhook,
} from "@/types/channel";

describe("渠道回调地址映射", () => {
  it("飞书 / 公众号 / 企业微信 映射到后端真实路由", () => {
    expect(channelWebhookPath("feishu_bot")).toBe("/api/remote/webhook/feishu");
    expect(channelWebhookPath("wechat_mp")).toBe("/api/remote/webhook/wechat-mp");
    expect(channelWebhookPath("wechat_work")).toBe("/api/remote/webhook/wecom");
  });

  it("后端新增回调路由的平台也能映射", () => {
    expect(channelWebhookPath("dingtalk_bot")).toBe("/api/remote/webhook/dingtalk");
    expect(channelWebhookPath("telegram_bot")).toBe("/api/remote/webhook/telegram");
    expect(channelWebhookPath("qq_bot")).toBe("/api/remote/webhook/qq");
    expect(channelWebhookPath("unknown_platform")).toBeUndefined();
    expect(supportsChannelWebhook("dingtalk_bot")).toBe(true);
    expect(supportsChannelWebhook("feishu_bot")).toBe(true);
    expect(supportsChannelWebhook("wecom_bot")).toBe(false);
  });

  it("映射表与后端已实现回调入站路由一致", () => {
    expect(Object.keys(CHANNEL_WEBHOOK_PATHS).sort()).toEqual(["dingtalk_bot", "feishu_bot", "qq_bot", "telegram_bot", "wechat_mp", "wechat_work"]);
    expect(Object.keys(CHANNEL_WEBHOOK_METHODS).sort()).toEqual(["dingtalk_bot", "feishu_bot", "qq_bot", "telegram_bot", "wechat_mp", "wechat_work"]);
  });

  it("请求方式说明：飞书/钉钉/QQ 仅 POST，公众号/企业微信为 GET+POST", () => {
    expect(channelWebhookMethod("feishu_bot")).toContain("POST");
    expect(channelWebhookMethod("feishu_bot")).not.toContain("GET");
    expect(channelWebhookMethod("wechat_mp")).toContain("GET");
    expect(channelWebhookMethod("wechat_work")).toContain("POST");
    expect(channelWebhookMethod("dingtalk_bot")).toContain("POST");
    expect(channelWebhookMethod("telegram_bot")).toContain("POST");
  });

  it("未知平台返回兜底说明，不抛错", () => {
    expect(channelWebhookMethod("unknown_platform")).toContain("POST");
  });
});

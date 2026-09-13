/** 渠道平台注册表（唯一真源）
 * 设计文档: channel_integration_design_20260730.md
 *
 * - 后端 ChannelEntity.platform 为 VARCHAR(32)（不再用数据库 enum），新增平台只需在此登记；
 * - 渲染层 src/types/channel.ts 的 ChannelPlatform 与此保持一致；
 * - inbound 标记该平台是否已有 webhook 回调适配器（未实现的仅支持出站/前端渠道）。
 * - category 区分「入站消息(im)」与「内容发布(publish)」两类，前端按类分组展示。
 */

export type ChannelCategory = "im" | "publish";

export interface ChannelCredentialField {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
}

export interface ChannelPlatformMeta {
  /** 平台标识 */
  platform: string;
  /** 中文名 */
  label: string;
  /** 图标 emoji */
  emoji: string;
  /** 分类：im=入站消息渠道 / publish=内容发布平台 */
  category: ChannelCategory;
  /** 连接方式：token(凭证) | qr(扫码) | webhook(回调) */
  connectionType: "token" | "qr" | "webhook";
  /** 是否已有服务端回调适配器（接收入站消息） */
  inbound: boolean;
  /** 是否依赖本地网关/插件（如微信、企业微信机器人） */
  plugin?: boolean;
  /** 简介 */
  description?: string;
  /** 需要填写的凭证字段（与 credentials 子键一一对应） */
  credentialFields?: ChannelCredentialField[];
  /** 接入指引 */
  instructions?: string[];
  /** 发布平台专用：创作中心首页 / 发布页（桌面端扫码登录用） */
  homeUrl?: string;
  publishUrl?: string;
}

export const CHANNEL_PLATFORMS: ChannelPlatformMeta[] = [
  // ============ 入站消息渠道（IM） ============
  {
    platform: "wechat_mp",
    label: "微信公众号",
    emoji: "💬",
    category: "im",
    connectionType: "webhook",
    inbound: true,
    description: "服务号/订阅号消息与被动回复，支持入站回调",
    credentialFields: [
      { key: "appId", label: "AppID", placeholder: "wx1234567890abcdef" },
      { key: "appSecret", label: "AppSecret", placeholder: "平台密钥", secret: true },
      { key: "token", label: "Token", placeholder: "服务器配置 Token", secret: true },
      { key: "encodingAesKey", label: "EncodingAESKey", placeholder: "43 位随机字符串", secret: true },
    ],
    instructions: [
      "登录微信公众平台 → 设置与开发 → 基本配置",
      "把「Webhook 回调地址」填入服务器配置 URL",
      "Token / EncodingAESKey 与平台配置保持一致",
    ],
  },
  {
    platform: "wechat_work",
    label: "企业微信",
    emoji: "🏢",
    category: "im",
    connectionType: "webhook",
    inbound: true,
    description: "企业微信应用消息收发，支持入站回调",
    credentialFields: [
      { key: "corpId", label: "CorpID", placeholder: "企业 ID" },
      { key: "corpSecret", label: "CorpSecret", placeholder: "应用密钥", secret: true },
      { key: "agentId", label: "AgentID", placeholder: "自建应用 AgentId" },
      { key: "token", label: "Token", placeholder: "接收消息 Token", secret: true },
      { key: "encodingAesKey", label: "EncodingAESKey", placeholder: "43 位随机字符串", secret: true },
    ],
    instructions: [
      "企业微信管理后台 → 应用管理 → 自建应用",
      "配置「接收消息」URL 为 Webhook 回调地址",
    ],
  },
  {
    platform: "feishu_bot",
    label: "飞书机器人",
    emoji: "🐦",
    category: "im",
    connectionType: "webhook",
    inbound: true,
    description: "飞书开放平台应用或自定义机器人，支持事件订阅入站",
    credentialFields: [
      { key: "appId", label: "App ID", placeholder: "cli_xxxxxxxx" },
      { key: "appSecret", label: "App Secret", placeholder: "应用密钥", secret: true },
      { key: "encryptKey", label: "Encrypt Key", placeholder: "事件加密密钥（开启加密时必填）", secret: true },
      { key: "token", label: "Verification Token", placeholder: "事件校验 Token", secret: true },
    ],
    instructions: [
      "飞书开放平台 → 创建企业自建应用 → 事件订阅",
      "请求地址填 Webhook 回调地址，订阅「接收消息」事件",
    ],
  },
  {
    platform: "dingtalk_bot",
    label: "钉钉机器人",
    emoji: "📌",
    category: "im",
    connectionType: "webhook",
    inbound: true,
    description: "钉钉群机器人：出站推送 + Outgoing 回调入站（加签校验）",
    credentialFields: [
      { key: "webhookToken", label: "Webhook Token", placeholder: "robot/send?access_token=xxx 中的 token", secret: true },
      { key: "secret", label: "加签密钥", placeholder: "SEC 开头的密钥（出站加签用，可选）", secret: true },
      { key: "appKey", label: "AppKey", placeholder: "企业内部应用 AppKey（可选）" },
      { key: "appSecret", label: "AppSecret", placeholder: "企业内部应用 AppSecret（可选）", secret: true },
    ],
    instructions: [
      "钉钉群 → 智能群助手 → 添加机器人 → 自定义（Webhook）",
      "复制 Webhook 地址中的 access_token 填入「Webhook Token」",
      "如需入站：机器人配置「Outgoing 机制」→ 填 Webhook 回调地址",
    ],
  },
  {
    platform: "telegram_bot",
    label: "Telegram",
    emoji: "✈️",
    category: "im",
    connectionType: "webhook",
    inbound: true,
    description: "Telegram Bot 消息收发，支持 setWebhook 回调入站",
    credentialFields: [
      { key: "botToken", label: "Bot Token", placeholder: "123456:ABC-DEF...", secret: true },
      { key: "webhookSecret", label: "Webhook Secret", placeholder: "自定义 secret_token（可选，校验用）", secret: true },
    ],
    instructions: [
      "与 @BotFather 对话创建 Bot，复制 Bot Token",
      "把「Webhook 回调地址」写入 setWebhook 的 url",
      "如需校验来源，配置 secret_token 与 Webhook Secret 一致",
    ],
  },
  {
    platform: "wecom_bot",
    label: "企业微信群机器人",
    emoji: "🤖",
    category: "im",
    connectionType: "token",
    inbound: false,
    plugin: true,
    description: "企业微信群机器人出站推送（markdown/text），仅出站",
    credentialFields: [
      { key: "webhookUrl", label: "Webhook 地址", placeholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx", secret: true },
    ],
    instructions: ["企业微信群 → 添加群机器人 → 复制 Webhook 地址", "仅支持出站消息推送"],
  },
  {
    platform: "qq_bot",
    label: "QQ 机器人",
    emoji: "🐧",
    category: "im",
    connectionType: "token",
    inbound: true,
    description: "QQ 开放平台机器人消息收发",
    credentialFields: [
      { key: "appId", label: "AppID", placeholder: "QQ 机器人 AppID" },
      { key: "appSecret", label: "AppSecret", placeholder: "机器人 AppSecret", secret: true },
      { key: "token", label: "Token", placeholder: "回调校验 Token", secret: true },
    ],
    instructions: ["QQ 开放平台 → 机器人 → 创建应用", "复制 AppID / AppSecret / Token", "配置 Webhook 回调地址接收入站消息"],
  },

  // ============ 内容发布平台（桌面端扫码登录驱动） ============
  {
    platform: "douyin",
    label: "抖音",
    emoji: "🎵",
    category: "publish",
    connectionType: "qr",
    inbound: false,
    description: "抖音创作者中心，桌面端扫码登录后驱动发布",
    credentialFields: [{ key: "accountName", label: "账号名称", placeholder: "登录后自动回填，可留空" }],
    instructions: ["点击「扫码登录」在桌面端弹出抖音创作中心", "登录后账号写入本地加密会话，发布时复用"],
    homeUrl: "https://creator.douyin.com/",
    publishUrl: "https://creator.douyin.com/creator-micro/content/upload",
  },
  {
    platform: "kuaishou",
    label: "快手",
    emoji: "⚡",
    category: "publish",
    connectionType: "qr",
    inbound: false,
    description: "快手创作者平台，桌面端扫码登录后驱动发布",
    credentialFields: [{ key: "accountName", label: "账号名称", placeholder: "登录后自动回填，可留空" }],
    instructions: ["点击「扫码登录」在桌面端弹出快手创作者平台"],
    homeUrl: "https://cp.kuaishou.com/",
    publishUrl: "https://cp.kuaishou.com/article/publish/video",
  },
  {
    platform: "xiaohongshu",
    label: "小红书",
    emoji: "📕",
    category: "publish",
    connectionType: "qr",
    inbound: false,
    description: "小红书创作服务台（自动发布受限，建议手动确认）",
    credentialFields: [{ key: "accountName", label: "账号名称", placeholder: "登录后自动回填，可留空" }],
    instructions: ["点击「扫码登录」在桌面端弹出小红书创作服务台", "小红书风控较严，建议发布前人工确认"],
    homeUrl: "https://creator.xiaohongshu.com/",
    publishUrl: "https://creator.xiaohongshu.com/publish/publish?source=official",
  },
  {
    platform: "bilibili",
    label: "B站",
    emoji: "📺",
    category: "publish",
    connectionType: "qr",
    inbound: false,
    description: "B 站创作中心，桌面端扫码/账号登录后驱动投稿",
    credentialFields: [{ key: "accountName", label: "账号名称", placeholder: "登录后自动回填，可留空" }],
    instructions: ["点击「扫码登录」在桌面端弹出 B 站创作中心"],
    homeUrl: "https://member.bilibili.com/",
    publishUrl: "https://member.bilibili.com/platform/upload/video/frame",
  },
  {
    platform: "xigua",
    label: "西瓜视频",
    emoji: "🍉",
    category: "publish",
    connectionType: "qr",
    inbound: false,
    description: "西瓜视频创作者平台，桌面端扫码登录后驱动发布",
    credentialFields: [{ key: "accountName", label: "账号名称", placeholder: "登录后自动回填，可留空" }],
    instructions: ["点击「扫码登录」在桌面端弹出西瓜视频创作者平台"],
    homeUrl: "https://creator.xigua.com/",
    publishUrl: "https://creator.xigua.com/creator/content/publish",
  },
  {
    platform: "wx_channels",
    label: "微信视频号",
    emoji: "🦋",
    category: "publish",
    connectionType: "qr",
    inbound: false,
    description: "微信视频号（蝴蝶号）助手，桌面端扫码登录后驱动发布",
    credentialFields: [{ key: "accountName", label: "账号名称", placeholder: "登录后自动回填，可留空" }],
    instructions: ["点击「扫码登录」在桌面端弹出视频号助手（微信扫码）"],
    homeUrl: "https://channels.weixin.qq.com/",
    publishUrl: "https://channels.weixin.qq.com/platform/post/create",
  },
  {
    platform: "weibo",
    label: "微博",
    emoji: "🌐",
    category: "publish",
    connectionType: "qr",
    inbound: false,
    description: "微博，桌面端扫码登录后驱动发布",
    credentialFields: [{ key: "accountName", label: "账号名称", placeholder: "登录后自动回填，可留空" }],
    instructions: ["点击「扫码登录」在桌面端弹出微博"],
    homeUrl: "https://weibo.com/",
    publishUrl: "https://weibo.com/compose",
  },
  {
    platform: "zhihu",
    label: "知乎",
    emoji: "🔵",
    category: "publish",
    connectionType: "qr",
    inbound: false,
    description: "知乎（无公开发布 API，仅会话驱动，建议手动）",
    credentialFields: [{ key: "accountName", label: "账号名称", placeholder: "登录后自动回填，可留空" }],
    instructions: ["点击「扫码登录」在桌面端弹出知乎", "知乎无公开发布接口，建议手动确认后发布"],
    homeUrl: "https://www.zhihu.com/",
    publishUrl: "https://zhuanlan.zhihu.com/write",
  },
];

export const CHANNEL_PLATFORM_IDS: string[] = CHANNEL_PLATFORMS.map((p) => p.platform);

/** 入站消息渠道（IM） */
export const CHANNEL_IM_PLATFORMS: ChannelPlatformMeta[] = CHANNEL_PLATFORMS.filter((p) => p.category === "im");
/** 内容发布平台 */
export const CHANNEL_PUBLISH_PLATFORMS: ChannelPlatformMeta[] = CHANNEL_PLATFORMS.filter((p) => p.category === "publish");

export function getChannelPlatformMeta(platform: string): ChannelPlatformMeta | undefined {
  return CHANNEL_PLATFORMS.find((p) => p.platform === platform);
}

export function isKnownChannelPlatform(platform: string): boolean {
  return Boolean(getChannelPlatformMeta(platform));
}

/** 是否为扫码会话驱动的发布平台（发布动作在桌面端完成） */
export function isDesktopDrivenPublishPlatform(platform: string): boolean {
  const meta = getChannelPlatformMeta(platform);
  return Boolean(meta && meta.category === "publish" && meta.connectionType === "qr");
}

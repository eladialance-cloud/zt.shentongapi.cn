// 渠道对接模块类型定义
// 设计文档: channel_integration_design_20260730.md

/** 平台类型（与后端 channel-platforms.ts 保持一致；后端 platform 为 VARCHAR，新增平台不需改表枚举） */
export type ChannelPlatform =
  | "wechat_mp" | "wechat_work" | "feishu_bot" | "dingtalk_bot" | "telegram_bot"
  | "wecom_bot" | "qq_bot"
  | "douyin" | "kuaishou" | "xiaohongshu" | "bilibili" | "xigua" | "wx_channels"
  | "weibo" | "zhihu"

/** 平台分类：im=入站消息渠道 / publish=内容发布平台 */
export type ChannelCategory = "im" | "publish"

/** 连接方式：token(凭证) | qr(扫码) | webhook(回调) */
export type ChannelConnectionType = "token" | "qr" | "webhook"

/** 消息方向 */
export type ChannelDirection = "input" | "output" | "both"

/** 渠道状态 */
export type ChannelStatus = "active" | "disabled" | "error"

/** 渠道 */
export interface Channel {
  id: number
  name: string
  platform: ChannelPlatform
  direction: ChannelDirection
  status: ChannelStatus
  webhookUrl?: string
  webhookToken?: string
  teamId?: number
  agentId?: number
  /** 绑定的官署/角色 id（如 bingbu/libu） */
  agentRef?: string
  /** 账号 ID（同平台多账号，默认 default） */
  accountId?: string
  lastMessageAt?: string
  userId: number
  createdAt: string
  updatedAt?: string
}

/** 创建渠道 DTO */
export interface CreateChannelDto {
  name: string
  platform: ChannelPlatform
  direction: ChannelDirection
  credentials?: Record<string, string>
  webhookUrl?: string
  webhookToken?: string
  teamId?: number
  agentId?: number
  agentRef?: string
  accountId?: string
}

/** 更新渠道 DTO */
export interface UpdateChannelDto {
  name?: string
  direction?: ChannelDirection
  status?: "active" | "disabled"
  credentials?: Record<string, string>
  webhookUrl?: string
  webhookToken?: string
  teamId?: number
  agentId?: number
  agentRef?: string
  accountId?: string
}

/** 渠道路由 */
export interface ChannelRoute {
  channelId: number
  platform: ChannelPlatform
  webhookUrl: string
  status: ChannelStatus
}

/** 发布计划状态 */
export type PublishStatus =
  | "draft" | "pending_review" | "approved"
  | "rejected" | "published" | "failed"

/** 发布模式 */
export type PublishMode = "manual" | "scheduled" | "auto"

/** 发布计划 */
export interface PublishPlan {
  id: number
  title: string
  content?: string
  mediaUrls?: string[]
  targetPlatforms: string[]
  mode: PublishMode
  status: PublishStatus
  reviewStatus: "pending" | "approved" | "rejected"
  reviewComment?: string
  publishResult?: Record<string, unknown>
  taskId?: number | null
  assetIds?: number[] | null
  scheduledAt?: string
  publishedAt?: string
  userId: number
  createdAt: string
  updatedAt?: string
}

/** 创建发布计划 DTO */
export interface CreatePublishPlanDto {
  title: string
  content?: string
  mediaUrls?: string[]
  targetPlatforms: string[]
  mode?: PublishMode
  scheduledAt?: string
  taskId?: number
  assetIds?: number[]
}

/** 渠道消息 */
export interface ChannelMessage {
  id: number
  channelId: number
  direction: "inbound" | "outbound"
  externalId?: string
  senderExternalId?: string
  senderName?: string
  content?: string
  messageType: string
  status: string
  replyContent?: string
  createdAt: string
}

/** 平台标签信息 */
export const PLATFORM_LABELS: Record<ChannelPlatform, { label: string; emoji: string }> = {
  wechat_mp: { label: "微信公众号", emoji: "💬" },
  wechat_work: { label: "企业微信", emoji: "🏢" },
  feishu_bot: { label: "飞书机器人", emoji: "🐦" },
  dingtalk_bot: { label: "钉钉机器人", emoji: "📌" },
  telegram_bot: { label: "Telegram", emoji: "✈️" },
  wecom_bot: { label: "企业微信群机器人", emoji: "🤖" },
  qq_bot: { label: "QQ 机器人", emoji: "🐧" },
  douyin: { label: "抖音", emoji: "🎵" },
  kuaishou: { label: "快手", emoji: "⚡" },
  xiaohongshu: { label: "小红书", emoji: "📕" },
  bilibili: { label: "B站", emoji: "📺" },
  xigua: { label: "西瓜视频", emoji: "🍉" },
  wx_channels: { label: "微信视频号", emoji: "🦋" },
  weibo: { label: "微博", emoji: "🌐" },
  zhihu: { label: "知乎", emoji: "🔵" },
}

/** 渠道账号 ID 规范：小写字母/数字/连字符/下划线，1-64 字符 */
export const ACCOUNT_ID_RE = /^[a-z0-9_-]{1,64}$/

/** 规范化账号 ID（与后端 ChannelService.normalizeAccountId 保持一致） */
export function normalizeAccountId(raw?: string | null): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return s ? s.slice(0, 64) : "default"
}

/** 账号绑定描述：已绑定返回「绑定对象：X」，否则「未绑定」 */
export function describeAgentBinding(agentRef?: string | null, agentId?: number | null): string {
  if (agentRef) return `绑定对象：${agentRef}`
  if (agentId) return `绑定对象：#${agentId}`
  return "未绑定"
}

/** 平台元数据（连接方式/凭证字段/接入指引），渲染层用 */
export interface ChannelPlatformMeta {
  platform: ChannelPlatform
  label: string
  emoji: string
  /** 分类：im=入站消息渠道 / publish=内容发布平台 */
  category: ChannelCategory
  connectionType: ChannelConnectionType
  /** 是否服务端已支持入站回调 */
  inbound: boolean
  /** 是否依赖本地网关/插件 */
  plugin?: boolean
  description: string
  /** 需要填写的凭证字段（key 为 credentials 子键） */
  credentialFields: Array<{ key: string; label: string; placeholder?: string; secret?: boolean }>
  /** 接入指引 */
  instructions: string[]
  /** 发布平台：创作中心首页 / 发布页（桌面端扫码登录） */
  homeUrl?: string
  publishUrl?: string
}

export const CHANNEL_PLATFORMS: ChannelPlatformMeta[] = [
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
    instructions: ["QQ 开放平台 → 机器人 → 创建应用", "复制 AppID / AppSecret / Token"],
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
]

/** 入站消息渠道（IM） */
export const CHANNEL_IM_PLATFORMS: ChannelPlatformMeta[] = CHANNEL_PLATFORMS.filter((p) => p.category === "im")
/** 内容发布平台 */
export const CHANNEL_PUBLISH_PLATFORMS: ChannelPlatformMeta[] = CHANNEL_PLATFORMS.filter((p) => p.category === "publish")

/** 是否为扫码会话驱动的发布平台 */
export function isDesktopDrivenPublishPlatform(platform: string): boolean {
  const meta = getChannelPlatformMeta(platform)
  return Boolean(meta && meta.category === "publish" && meta.connectionType === "qr")
}

export function getChannelPlatformMeta(platform: string): ChannelPlatformMeta | undefined {
  return CHANNEL_PLATFORMS.find((p) => p.platform === platform)
}

/** 平台 → 后端 Webhook 回调路径（对齐 backend/src/modules/remote/remote.controller.ts） */
export const CHANNEL_WEBHOOK_PATHS: Partial<Record<ChannelPlatform, string>> = {
  feishu_bot: "/api/remote/webhook/feishu",
  wechat_mp: "/api/remote/webhook/wechat-mp",
  wechat_work: "/api/remote/webhook/wecom",
  dingtalk_bot: "/api/remote/webhook/dingtalk",
  telegram_bot: "/api/remote/webhook/telegram",
  qq_bot: "/api/remote/webhook/qq",
}

/** 平台 → 回调请求方式说明 */
export const CHANNEL_WEBHOOK_METHODS: Partial<Record<ChannelPlatform, string>> = {
  feishu_bot: "POST（事件订阅）",
  wechat_mp: "GET（URL 验证）/ POST（消息推送）",
  wechat_work: "GET（URL 验证）/ POST（消息推送）",
  dingtalk_bot: "POST（Outgoing 回调，加签）",
  telegram_bot: "POST（setWebhook 回调，secret_token）",
  qq_bot: "POST（Webhook 回调）",
}

/** 取平台对应的回调路径；该平台无回调入口时返回 undefined */
export function channelWebhookPath(platform: string): string | undefined {
  return CHANNEL_WEBHOOK_PATHS[platform as ChannelPlatform]
}

/** 该平台是否已提供回调入口 */
export function supportsChannelWebhook(platform: string): boolean {
  return Boolean(channelWebhookPath(platform))
}

/** 取平台回调的请求方式说明 */
export function channelWebhookMethod(platform: string): string {
  return CHANNEL_WEBHOOK_METHODS[platform as ChannelPlatform] || "POST（消息推送）/ GET（URL 验证）"
}

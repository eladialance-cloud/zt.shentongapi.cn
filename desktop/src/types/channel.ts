// 渠道对接模块类型定义
// 设计文档: channel_integration_design_20260730.md

/** 平台类型 */
export type ChannelPlatform =
  | "wechat_mp" | "wechat_work" | "feishu_bot"
  | "dingtalk_bot" | "telegram_bot"

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
}

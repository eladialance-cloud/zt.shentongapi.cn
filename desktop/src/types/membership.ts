// 会员状态类型（M8-2 灰锁 UI 数据源，对应后端 GET /membership/status）
export type MembershipLevel = 'free' | 'pro' | 'enterprise'
export type MembershipStatus = 'active' | 'expired' | 'cancelled'

export interface MembershipFeatures {
  voiceClone: boolean | number | 'unlimited'
  digitalHumans: number | 'all' | 'all_private'
  publish: 'export_only' | 'full' | 'api'
  watermark: boolean
  monthlyLimit: number | null
  creditsPerMonth: number
}

export interface MembershipStatusView {
  level: MembershipLevel
  status: MembershipStatus
  features: MembershipFeatures
  expiresAt: string | null
  graceDaysLeft: number
}

export const LEVEL_LABEL: Record<MembershipLevel, string> = {
  free: '免费版',
  pro: '专业版',
  enterprise: '企业版',
}

export const LEVEL_COLOR: Record<MembershipLevel, string> = {
  free: 'default',
  pro: 'blue',
  enterprise: 'gold',
}

/** 声音克隆可用性（数字 true=可克隆数量，'unlimited'=不限） */
export function voiceCloneEnabled(features: MembershipFeatures | undefined): boolean {
  return !!features && features.voiceClone !== false
}

// 管理端会员管理类型（M7-4）
export type MembershipLevel = 'free' | 'pro' | 'enterprise'
export type RedeemCodeStatus = 'unused' | 'used' | 'revoked'

export interface RedeemCode {
  code: string
  level: MembershipLevel
  durationDays: number
  status: RedeemCodeStatus
  usedBy?: number | null
  usedAt?: string | null
  batchId?: string | null
  createdAt: string
}

export interface GenerateCodesParams {
  level: MembershipLevel
  durationDays: number
  count: number
  batchId?: string
}

export interface ListCodesParams {
  batchId?: string
  status?: RedeemCodeStatus | string
  limit?: number
}

export interface GrantMembershipParams {
  userId: number
  level: MembershipLevel
  durationDays: number
}

// 会员状态 API（M8-2 灰锁 UI）
import { httpClient } from './http-client'
import type { MembershipStatusView } from '@/types/membership'

/**
 * 获取当前用户会员状态（等级 + features + 到期/宽限）
 * GET /membership/status
 */
export async function getMembershipStatus(): Promise<MembershipStatusView> {
  return httpClient.get<MembershipStatusView>('/membership/status')
}

/**
 * 兑换码兑换会员
 * POST /membership/redeem  body: { code }
 */
export async function redeemMembership(code: string): Promise<MembershipStatusView> {
  return httpClient.post<MembershipStatusView>('/membership/redeem', { code })
}

export default { getMembershipStatus, redeemMembership }

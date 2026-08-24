// 管理端会员管理 API（M7-4）
import { adminRequest } from './admin-auth-api'
import type {
  RedeemCode,
  GenerateCodesParams,
  ListCodesParams,
  GrantMembershipParams
} from '@/types/admin-membership'

const BASE = '/admin/membership'

/** 批量生成兑换码 */
export async function generateRedeemCodes(params: GenerateCodesParams): Promise<string[]> {
  return adminRequest<string[]>('post', `${BASE}/redeem-codes/generate`, { data: params })
}

/** 兑换码列表（批次/状态筛选） */
export async function listRedeemCodes(params: ListCodesParams = {}): Promise<RedeemCode[]> {
  return adminRequest<RedeemCode[]>('get', `${BASE}/redeem-codes`, {
    params: params as Record<string, unknown>
  })
}

/** 作废兑换码 */
export async function revokeRedeemCode(code: string): Promise<void> {
  await adminRequest('post', `${BASE}/redeem-codes/${encodeURIComponent(code)}/revoke`)
}

/** 直接开通/延期会员 */
export async function grantMembership(params: GrantMembershipParams): Promise<void> {
  await adminRequest('post', `${BASE}/users/${params.userId}/grant`, {
    data: { level: params.level, durationDays: params.durationDays }
  })
}

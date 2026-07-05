// 管理端用户管理 API
//
// 端点契约：
//   GET    /admin/users                          用户列表
//   POST   /admin/users/:id/ban                  封禁用户
//   POST   /admin/users/:id/unban                解封用户
//   PATCH  /admin/users/:id/level                调整等级
//   GET    /admin/user-levels                    用户等级列表
//   PUT    /admin/user-levels/:level             更新等级配置
//   GET    /admin/users/:id/credits-account      用户积分账户
//   POST   /admin/users/:id/credits-adjust       手动调整积分
//   GET    /admin/users/:id/credits-transactions 积分流水
//   GET    /admin/recharge-orders                充值订单列表
//   POST   /admin/recharge-orders/:id/refund     退款
//   GET    /admin/devices                        设备列表
//   DELETE /admin/devices/:id                    远程解绑设备

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdminCreditTransaction,
  AdminCreditsAccount,
  AdminDevice,
  AdminDeviceQuery,
  AdminUserItem,
  AdminUserQuery,
  BanUserDto,
  CreditsAdjustDto,
  RechargeOrder,
  RechargeOrderQuery,
  RefundDto,
  UpdateUserLevelDto,
  UserLevel
} from '@/types/admin-user'

/** 用户列表 */
export async function listAdminUsers(
  query: AdminUserQuery = {}
): Promise<AdminPaginatedResult<AdminUserItem>> {
  return adminRequest<AdminPaginatedResult<AdminUserItem>>('get', '/admin/users', {
    params: query as Record<string, unknown>
  })
}

/** 封禁用户 */
export async function banUser(id: number, dto: BanUserDto): Promise<void> {
  await adminRequest<void>('post', `/admin/users/${id}/ban`, { data: dto })
}

/** 解封用户 */
export async function unbanUser(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/users/${id}/unban`)
}

/** 调整用户等级 */
export async function updateUserLevel(
  id: number,
  level: number
): Promise<void> {
  await adminRequest<void>('patch', `/admin/users/${id}/level`, {
    data: { level }
  })
}

/** 用户等级配置列表 */
export async function listUserLevels(): Promise<UserLevel[]> {
  return adminRequest<UserLevel[]>('get', '/admin/user-levels')
}

/** 更新等级配置 */
export async function updateUserLevelConfig(
  level: number,
  dto: UpdateUserLevelDto
): Promise<void> {
  await adminRequest<void>('put', `/admin/user-levels/${level}`, { data: dto })
}

/** 用户积分账户 */
export async function getUserCreditsAccount(
  id: number
): Promise<AdminCreditsAccount> {
  return adminRequest<AdminCreditsAccount>(
    'get',
    `/admin/users/${id}/credits-account`
  )
}

/** 手动调整积分 */
export async function adjustUserCredits(
  id: number,
  dto: CreditsAdjustDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/users/${id}/credits-adjust`, {
    data: dto
  })
}

/** 用户积分流水 */
export async function listUserCreditTransactions(
  id: number,
  limit = 50
): Promise<AdminCreditTransaction[]> {
  return adminRequest<AdminCreditTransaction[]>(
    'get',
    `/admin/users/${id}/credits-transactions`,
    { params: { limit } }
  )
}

/** 充值订单列表 */
export async function listRechargeOrders(
  query: RechargeOrderQuery = {}
): Promise<AdminPaginatedResult<RechargeOrder>> {
  return adminRequest<AdminPaginatedResult<RechargeOrder>>(
    'get',
    '/admin/recharge-orders',
    { params: query as Record<string, unknown> }
  )
}

/** 退款 */
export async function refundOrder(id: number, dto: RefundDto): Promise<void> {
  await adminRequest<void>('post', `/admin/recharge-orders/${id}/refund`, {
    data: dto
  })
}

/** 设备列表 */
export async function listAdminDevices(
  query: AdminDeviceQuery = {}
): Promise<AdminPaginatedResult<AdminDevice>> {
  return adminRequest<AdminPaginatedResult<AdminDevice>>('get', '/admin/devices', {
    params: query as Record<string, unknown>
  })
}

/** 远程解绑设备 */
export async function deleteDevice(id: number): Promise<void> {
  await adminRequest<void>('delete', `/admin/devices/${id}`)
}

export default {
  listAdminUsers,
  banUser,
  unbanUser,
  updateUserLevel,
  listUserLevels,
  updateUserLevelConfig,
  getUserCreditsAccount,
  adjustUserCredits,
  listUserCreditTransactions,
  listRechargeOrders,
  refundOrder,
  listAdminDevices,
  deleteDevice
}

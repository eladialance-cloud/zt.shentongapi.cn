// 管理端用户管理模块类型定义
// 数据合同真源：Task 18 - 用户管理

import type { AdminPaginatedResult } from './admin-auth'

/** 用户状态 */
export type UserStatus = 'active' | 'banned'

/** 管理端用户视图 */
export interface AdminUserItem {
  id: number
  username: string
  email: string
  phone?: string
  avatar?: string
  level: number
  status: UserStatus
  /** 积分余额 */
  creditsBalance: number
  /** 注册时间 ISO 8601 */
  createdAt: string
  updatedAt: string
}

/** 用户列表查询参数 */
export interface AdminUserQuery {
  keyword?: string
  status?: UserStatus
  level?: number
  startTime?: string
  endTime?: string
  page?: number
  pageSize?: number
}

/** 封禁请求 */
export interface BanUserDto {
  reason: string
}

/** 用户等级配置 */
export interface UserLevel {
  level: number
  name: string
  /** 最低积分门槛 */
  minCredits: number
  /** 最大并发数 */
  maxConcurrency: number
  /** 日调用上限 */
  dailyCallLimit: number
  /** 月积分上限 */
  monthlyCreditsLimit: number
  updatedAt: string
}

/** 用户等级更新 DTO */
export interface UpdateUserLevelDto {
  name?: string
  minCredits?: number
  maxConcurrency?: number
  dailyCallLimit?: number
  monthlyCreditsLimit?: number
}

/** 用户积分账户(管理端视图) */
export interface AdminCreditsAccount {
  userId: number
  username: string
  balance: number
  frozenBalance: number
  totalRecharged: number
  totalConsumed: number
  /** 账户版本号(乐观锁) */
  version: number
  updatedAt: string
}

/** 积分调整 DTO */
export interface CreditsAdjustDto {
  /** 金额(正负) */
  amount: number
  remark: string
}

/** 积分流水(管理端视图) */
export interface AdminCreditTransaction {
  id: number
  type: string
  amount: number
  balanceBefore: number
  balanceAfter: number
  source: string
  remark: string
  createdAt: string
}

/** 充值订单状态 */
export type RechargeOrderStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'

/** 充值订单 */
export interface RechargeOrder {
  id: number
  /** 订单号 */
  orderNo: string
  userId: number
  username: string
  /** 支付金额(元) */
  amount: number
  /** 积分数 */
  credits: number
  paymentMethod: string
  status: RechargeOrderStatus
  createdAt: string
  paidAt?: string
}

/** 充值订单查询参数 */
export interface RechargeOrderQuery {
  status?: RechargeOrderStatus
  paymentMethod?: string
  startTime?: string
  endTime?: string
  page?: number
  pageSize?: number
}

/** 退款 DTO */
export interface RefundDto {
  reason: string
}

/** 设备记录 */
export interface AdminDevice {
  id: number
  userId: number
  username: string
  deviceName: string
  /** 设备指纹(脱敏) */
  deviceFingerprint: string
  lastLoginAt: string
  createdAt: string
}

/** 设备查询参数 */
export interface AdminDeviceQuery {
  keyword?: string
  page?: number
  pageSize?: number
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

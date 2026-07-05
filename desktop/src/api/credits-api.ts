// 积分中心 API
//
// 端点契约：
//   GET  /credits/balance           获取余额
//   GET  /credits/transactions      流水查询（分页 + 时间 + 来源）
//   GET  /credits/recharge-plans    充值套餐列表
//   POST /credits/recharge          创建充值订单（返回支付链接/二维码）

import { httpClient } from './http-client'
import type {
  CreditAccount,
  CreditTransaction,
  RechargePlan,
  CreateRechargeDto,
  RechargeResult,
  TransactionQuery,
  PaginatedResult
} from '@/types/credits'

/**
 * 获取积分账户余额
 * GET /credits/balance
 */
export async function getBalance(): Promise<CreditAccount> {
  return httpClient.get<CreditAccount>('/credits/balance')
}

/**
 * 查询积分流水（分页 + 时间范围 + 来源筛选）
 * GET /credits/transactions?page=&pageSize=&startDate=&endDate=&source=
 */
export async function getTransactions(
  query: TransactionQuery = {}
): Promise<PaginatedResult<CreditTransaction>> {
  return httpClient.get<PaginatedResult<CreditTransaction>>('/credits/transactions', {
    params: query
  })
}

/**
 * 获取充值套餐列表
 * GET /credits/recharge-plans
 */
export async function getRechargePlans(): Promise<RechargePlan[]> {
  return httpClient.get<RechargePlan[]>('/credits/recharge-plans')
}

/**
 * 创建充值订单
 * POST /credits/recharge  body: { planId, paymentMethod }
 * 返回支付链接 / 二维码
 */
export async function createRecharge(dto: CreateRechargeDto): Promise<RechargeResult> {
  return httpClient.post<RechargeResult>('/credits/recharge', dto)
}

export default {
  getBalance,
  getTransactions,
  getRechargePlans,
  createRecharge
}

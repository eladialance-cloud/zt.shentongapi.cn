// 积分中心模块类型定义
// 数据合同真源：Task 6 - 积分中心 + 后端 src/modules/credits

/** 积分账户余额 */
export interface CreditAccount {
  balance: number
  frozenBalance: number
  totalRecharged: number
  totalConsumed: number
}

/** 积分流水类型 */
export type CreditTransactionType =
  | 'recharge'
  | 'consume'
  | 'freeze'
  | 'settle'
  | 'refund'
  | 'reward'
  | 'admin_adjust'

/** 积分流水记录 */
export interface CreditTransaction {
  id: number
  type: CreditTransactionType
  amount: number
  balanceBefore: number
  balanceAfter: number
  source: string
  sourceId: string
  remark: string
  createdAt: Date
}

/** 充值套餐 */
export interface RechargePlan {
  id: number
  name: string
  credits: number
  bonusCredits: number
  price: number
  currency: string
  isRecommended: boolean
}

/** 创建充值订单 DTO */
export interface CreateRechargeDto {
  planId: number
  paymentMethod: 'wechat' | 'alipay' | 'stripe'
}

/** 支付方式 */
export type PaymentMethod = CreateRechargeDto['paymentMethod']

/** 充值结果（返回支付链接/二维码） */
export interface RechargeResult {
  orderId: string
  payUrl: string
  qrCode?: string
}

/** 流水查询参数 */
export interface TransactionQuery {
  page?: number
  pageSize?: number
  startDate?: string
  endDate?: string
  source?: string
}

/** 分页查询参数（复用通用结构） */
export interface PaginationQuery {
  page?: number
  pageSize?: number
}

/** 分页结果 */
export interface PaginatedResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// 管理端积分财务管理模块类型定义
// 数据合同真源：Task 24 - 积分财务管理

import type { AdminPaginatedResult } from './admin-auth'

/** 积分流水类型 */
export type CreditTransactionType =
  | 'recharge'
  | 'consume'
  | 'freeze'
  | 'settle'
  | 'refund'
  | 'reward'
  | 'admin_adjust'

/** 积分流水来源 */
export type CreditTransactionSource =
  | 'model_call'
  | 'plugin_call'
  | 'workflow_call'
  | 'kb_search'
  | 'recharge'
  | 'admin_adjust'
  | 'signup_reward'

/** 充值订单状态 */
export type RechargeOrderStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'refunded'

/** 支付方式 */
export type PaymentMethod = 'wechat' | 'alipay' | 'stripe' | 'other'

/** 发票状态 */
export type InvoiceStatus = 'pending' | 'issued' | 'rejected'

/** 发票类型(个人/企业) */
export type InvoiceType = 'personal' | 'enterprise'

/** 对账差异类型 */
export type ReconciliationType =
  | 'credit_balance'
  | 'token_usage'
  | 'payment'
  | 'key_pool_deduction'

/** 对账差异状态 */
export type ReconciliationStatus = 'pending' | 'resolved' | 'ignored'

/** 积分流水条目 */
export interface CreditTransaction {
  id: number
  /** 流水号 */
  txNo: string
  /** 用户 ID */
  userId: number
  /** 用户名 */
  username: string
  type: CreditTransactionType
  source: CreditTransactionSource
  /** 金额(正为入账,负为出账) */
  amount: number
  /** 操作前余额 */
  balanceBefore: number
  /** 操作后余额 */
  balanceAfter: number
  /** 关联 ID(订单/调用记录等) */
  relatedId?: string
  /** 备注 */
  remark?: string
  /** ISO 8601 时间 */
  createdAt: string
}

/** 积分流水查询参数 */
export interface CreditTransactionQuery {
  userId?: number
  type?: CreditTransactionType
  source?: CreditTransactionSource
  startTime?: string
  endTime?: string
  page?: number
  pageSize?: number
}

/** 充值订单(财务视角) */
export interface FinanceRechargeOrder {
  id: number
  orderNo: string
  userId: number
  username: string
  /** 支付金额(元,decimal) */
  amount: number
  /** 积分数 */
  credits: number
  paymentMethod: PaymentMethod
  status: RechargeOrderStatus
  /** 创建时间 ISO 8601 */
  createdAt: string
  /** 支付时间 ISO 8601 */
  paidAt?: string
  /** 退款时间 ISO 8601 */
  refundedAt?: string
}

/** 充值订单查询参数 */
export interface FinanceOrderQuery {
  status?: RechargeOrderStatus
  paymentMethod?: PaymentMethod
  startTime?: string
  endTime?: string
  page?: number
  pageSize?: number
}

/** 退款 DTO */
export interface RefundOrderDto {
  reason: string
}

/** 发票申请条目 */
export interface InvoiceItem {
  id: number
  /** 申请号 */
  applyNo: string
  userId: number
  username: string
  /** 关联订单号 */
  orderNo: string
  invoiceType: InvoiceType
  /** 抬头 */
  title: string
  /** 税号(企业发票) */
  taxNo?: string
  /** 金额(元) */
  amount: number
  status: InvoiceStatus
  /** 发票号(开具后) */
  invoiceNumber?: string
  /** 发票 PDF URL */
  invoiceUrl?: string
  /** 驳回原因 */
  rejectReason?: string
  /** 申请时间 ISO 8601 */
  createdAt: string
  /** 开具时间 ISO 8601 */
  issuedAt?: string
}

/** 发票查询参数 */
export interface InvoiceQuery {
  status?: InvoiceStatus
  page?: number
  pageSize?: number
}

/** 开具发票 DTO */
export interface IssueInvoiceDto {
  invoiceNumber: string
  invoiceUrl?: string
}

/** 驳回发票 DTO */
export interface RejectInvoiceDto {
  reason: string
}

/** 对账差异条目 */
export interface ReconciliationDiff {
  id: number
  type: ReconciliationType
  /** 用户 ID */
  userId: number
  username?: string
  /** 差异金额 */
  diffAmount: number
  /** 详情说明 */
  detail: string
  status: ReconciliationStatus
  /** ISO 8601 时间 */
  createdAt: string
  /** 处理时间 */
  resolvedAt?: string
  /** 处理备注 */
  resolveRemark?: string
}

/** 对账差异查询参数 */
export interface ReconciliationQuery {
  type?: ReconciliationType
  status?: ReconciliationStatus
  page?: number
  pageSize?: number
}

/** 对账差异统计 */
export interface ReconciliationStats {
  total: number
  pending: number
  resolved: number
  ignored: number
  /** 总差异金额 */
  totalDiffAmount: number
}

/** 手动调整 DTO */
export interface AdjustReconciliationDto {
  amount: number
  remark: string
}

/** 复用通用分页结果 */
export type { AdminPaginatedResult }

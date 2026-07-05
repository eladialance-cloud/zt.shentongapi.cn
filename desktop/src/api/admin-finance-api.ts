// 管理端积分财务管理 API
//
// 端点契约：
//   GET    /admin/credits/transactions            积分流水查询
//   GET    /admin/recharge-orders                 充值订单列表
//   POST   /admin/recharge-orders/:id/refund      订单退款
//   GET    /admin/invoices                        发票列表
//   POST   /admin/invoices/:id/issue              开具发票
//   POST   /admin/invoices/:id/reject             驳回发票
//   GET    /admin/reconciliation/diffs            对账差异列表
//   POST   /admin/reconciliation/:id/adjust       手动调整差异
//   POST   /admin/reconciliation/:id/ignore       标记忽略差异

import { adminRequest } from './admin-auth-api'
import type { AdminPaginatedResult } from '@/types/admin-auth'
import type {
  AdjustReconciliationDto,
  CreditTransaction,
  CreditTransactionQuery,
  FinanceOrderQuery,
  FinanceRechargeOrder,
  InvoiceItem,
  InvoiceQuery,
  IssueInvoiceDto,
  ReconciliationDiff,
  ReconciliationQuery,
  ReconciliationStats,
  RefundOrderDto,
  RejectInvoiceDto
} from '@/types/admin-finance'

/** 积分流水查询 */
export async function listCreditTransactions(
  query: CreditTransactionQuery = {}
): Promise<AdminPaginatedResult<CreditTransaction>> {
  return adminRequest<AdminPaginatedResult<CreditTransaction>>(
    'get',
    '/admin/credits/transactions',
    { params: query as Record<string, unknown> }
  )
}

/** 充值订单列表 */
export async function listFinanceOrders(
  query: FinanceOrderQuery = {}
): Promise<AdminPaginatedResult<FinanceRechargeOrder>> {
  return adminRequest<AdminPaginatedResult<FinanceRechargeOrder>>(
    'get',
    '/admin/recharge-orders',
    { params: query as Record<string, unknown> }
  )
}

/** 订单退款 */
export async function refundFinanceOrder(
  id: number,
  dto: RefundOrderDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/recharge-orders/${id}/refund`, {
    data: dto
  })
}

/** 发票列表 */
export async function listInvoices(
  query: InvoiceQuery = {}
): Promise<AdminPaginatedResult<InvoiceItem>> {
  return adminRequest<AdminPaginatedResult<InvoiceItem>>(
    'get',
    '/admin/invoices',
    { params: query as Record<string, unknown> }
  )
}

/** 开具发票 */
export async function issueInvoice(
  id: number,
  dto: IssueInvoiceDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/invoices/${id}/issue`, {
    data: dto
  })
}

/** 驳回发票 */
export async function rejectInvoice(
  id: number,
  dto: RejectInvoiceDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/invoices/${id}/reject`, {
    data: dto
  })
}

/** 对账差异列表 */
export async function listReconciliationDiffs(
  query: ReconciliationQuery = {}
): Promise<AdminPaginatedResult<ReconciliationDiff>> {
  return adminRequest<AdminPaginatedResult<ReconciliationDiff>>(
    'get',
    '/admin/reconciliation/diffs',
    { params: query as Record<string, unknown> }
  )
}

/** 对账差异统计 */
export async function getReconciliationStats(
  type?: ReconciliationQuery['type']
): Promise<ReconciliationStats> {
  const params: Record<string, unknown> = {}
  if (type) params.type = type
  return adminRequest<ReconciliationStats>('get', '/admin/reconciliation/stats', {
    params
  })
}

/** 手动调整差异 */
export async function adjustReconciliationDiff(
  id: number,
  dto: AdjustReconciliationDto
): Promise<void> {
  await adminRequest<void>('post', `/admin/reconciliation/${id}/adjust`, {
    data: dto
  })
}

/** 标记忽略差异 */
export async function ignoreReconciliationDiff(id: number): Promise<void> {
  await adminRequest<void>('post', `/admin/reconciliation/${id}/ignore`)
}

export default {
  listCreditTransactions,
  listFinanceOrders,
  refundFinanceOrder,
  listInvoices,
  issueInvoice,
  rejectInvoice,
  listReconciliationDiffs,
  getReconciliationStats,
  adjustReconciliationDiff,
  ignoreReconciliationDiff
}

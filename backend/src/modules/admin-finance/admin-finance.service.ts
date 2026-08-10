import { Injectable } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreditTransactionEntity } from '../credits/entities/credit-transaction.entity';
import { RechargeOrderEntity } from '../payment/entities/recharge-order.entity';
import { PaymentRecordEntity } from '../payment/entities/payment-record.entity';
import { ReconciliationDiffEntity } from '../reconciliation/entities/reconciliation-diff.entity';
import { UserEntity } from '../user/entities/user.entity';
import { PaymentConfigEntity } from '../payment/entities/payment-config.entity';
import { CreditAccountEntity } from '../credits/entities/credit-account.entity';
import { PaymentGatewayService } from '../payment/services/payment-gateway.service';
import { CreditsService } from '../credits/services/credits.service';
import { InvoiceEntity } from './entities/invoice.entity';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { parsePaging, paginate } from '../../common/utils/query.util';
import { TransactionQueryDto } from './dto/transaction-query.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { InvoiceQueryDto } from './dto/invoice-query.dto';
import { ReconciliationQueryDto } from './dto/reconciliation-query.dto';
import { RefundDto } from './dto/refund.dto';
import { IssueInvoiceDto } from './dto/issue-invoice.dto';
import { RejectInvoiceDto } from './dto/reject-invoice.dto';
import { InvoiceAuditDto } from './dto/invoice-audit.dto';
import { AdjustReconciliationDto } from './dto/adjust-reconciliation.dto';

/**
 * 管理端积分财务管理服务
 * 数据合同真源：Task 24 - 积分财务管理
 */
@Injectable()
export class AdminFinanceService {
  constructor(
    @InjectRepository(CreditTransactionEntity)
    private txnRepo: Repository<CreditTransactionEntity>,
    @InjectRepository(RechargeOrderEntity)
    private orderRepo: Repository<RechargeOrderEntity>,
    @InjectRepository(PaymentRecordEntity)
    private paymentRepo: Repository<PaymentRecordEntity>,
    @InjectRepository(ReconciliationDiffEntity)
    private diffRepo: Repository<ReconciliationDiffEntity>,
    @InjectRepository(InvoiceEntity)
    private invoiceRepo: Repository<InvoiceEntity>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(PaymentConfigEntity)
    private configRepo: Repository<PaymentConfigEntity>,
    @InjectDataSource() private dataSource: DataSource,
    private readonly gateway: PaymentGatewayService,
    private readonly creditsService: CreditsService,
  ) {}

  // ============ 积分流水 ============

  /** 积分流水列表 */
  async listTransactions(query: TransactionQueryDto) {
    const { page, pageSize } = parsePaging(query.page, query.pageSize);
    const qb = this.txnRepo.createQueryBuilder('t');

    if (query.userId) {
      qb.andWhere('t.user_id = :uid', { uid: query.userId });
    }
    if (query.type) {
      qb.andWhere('t.type = :type', { type: query.type });
    }
    if (query.source) {
      qb.andWhere('t.source = :source', { source: query.source });
    }
    if (query.startTime) {
      qb.andWhere('t.created_at >= :start', { start: query.startTime });
    }
    if (query.endTime) {
      qb.andWhere('t.created_at <= :end', { end: query.endTime });
    }

    qb.orderBy('t.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    const userMap = await this.batchUsernames(items.map((i) => i.userId));
    return paginate(
      items.map((t) => this.toCreditTransaction(t, userMap.get(t.userId))),
      total,
      page,
      pageSize,
    );
  }

  /** 积分流水详情 */
  async getTransactionDetail(id: number) {
    const txn = await this.txnRepo.findOne({ where: { id } });
    if (!txn) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '流水不存在');
    }
    const username = await this.getUsername(txn.userId);
    return this.toCreditTransaction(txn, username);
  }

  /** 积分流水统计 */
  async getTransactionStats(query: TransactionQueryDto) {
    const baseQb = () => {
      const qb = this.txnRepo.createQueryBuilder('t');
      if (query.userId) qb.andWhere('t.user_id = :uid', { uid: query.userId });
      if (query.type) qb.andWhere('t.type = :type', { type: query.type });
      if (query.startTime) qb.andWhere('t.created_at >= :start', { start: query.startTime });
      if (query.endTime) qb.andWhere('t.created_at <= :end', { end: query.endTime });
      return qb;
    };

    const total = await baseQb().getCount();
    const income = await baseQb().andWhere('t.amount > 0').select('COALESCE(SUM(t.amount),0)', 'sum').getRawOne<{ sum: string }>();
    const outcome = await baseQb().andWhere('t.amount < 0').select('COALESCE(SUM(t.amount),0)', 'sum').getRawOne<{ sum: string }>();

    return {
      total,
      totalIncome: Number(income?.sum || 0),
      totalOutcome: Number(outcome?.sum || 0),
    };
  }

  // ============ 充值订单 ============

  /** 充值订单列表 */
  async listOrders(query: OrderQueryDto) {
    const { page, pageSize } = parsePaging(query.page, query.pageSize);
    const qb = this.orderRepo.createQueryBuilder('o');

    if (query.status) {
      qb.andWhere('o.status = :status', { status: query.status });
    }
    if (query.paymentMethod && query.paymentMethod !== 'other') {
      qb.andWhere('o.payment_channel = :ch', { ch: query.paymentMethod });
    }
    if (query.startTime) {
      qb.andWhere('o.created_at >= :start', { start: query.startTime });
    }
    if (query.endTime) {
      qb.andWhere('o.created_at <= :end', { end: query.endTime });
    }

    qb.orderBy('o.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    const userMap = await this.batchUsernames(items.map((i) => i.userId));

    // 批量查询支付记录（避免 N+1）
    const paymentIds = items.map((o) => o.paymentRecordId).filter(Boolean);
    const payments = paymentIds.length > 0
      ? await this.paymentRepo.createQueryBuilder('p').where('p.id IN (:...ids)', { ids: paymentIds }).getMany()
      : [];
    const paymentMap = new Map(payments.map((p) => [p.id, p]));

    const list = items.map((o) =>
      this.toFinanceRechargeOrder(o, o.paymentRecordId ? paymentMap.get(o.paymentRecordId) : undefined, userMap.get(o.userId)),
    );
    return paginate(list, total, page, pageSize);
  }

  /** 充值订单详情 */
  async getOrderDetail(id: number) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '订单不存在');
    }
    const payment = order.paymentRecordId
      ? await this.paymentRepo.findOne({ where: { id: order.paymentRecordId } })
      : null;
    const username = await this.getUsername(order.userId);
    return this.toFinanceRechargeOrder(order, payment, username);
  }

  /** 订单退款（真实渠道退款 + 积分扣回） */
  async refundOrder(id: number, dto: RefundDto) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '订单不存在');
    }
    if (order.status !== 'paid') {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '仅已支付订单可退款');
    }

    const payment = order.paymentRecordId
      ? await this.paymentRepo.findOne({ where: { id: order.paymentRecordId } })
      : null;
    const channel = order.paymentChannel || payment?.channel;
    if (!channel) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '订单缺少支付渠道信息');
    }
    const channelCfg = await this.configRepo.findOne({ where: { channel } });
    if (!channelCfg?.enabled || channelCfg.isMock) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '该支付渠道未启用真实支付，无法自动退款');
    }

    // 1) 调真实渠道退款（refundNo 固定基于订单号，保证渠道侧幂等）
    const refundNo = `RF${order.orderNo}`;
    await this.gateway.refund(channel, {
      orderNo: order.orderNo,
      refundNo,
      amount: Number(order.amount),
      totalAmount: Number(order.amount),
      config: (channelCfg.config || {}) as Record<string, unknown>,
      transactionId: payment?.paymentTxnId,
    });

    // 2) 本地事务：更新订单/支付记录 + 扣回积分（余额不足按实际余额扣并备注）
    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(RechargeOrderEntity);
      const locked = await orderRepo
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id = :id', { id })
        .getOne();
      if (!locked || locked.status !== 'paid') {
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, '订单状态已变化，退款中止');
      }
      const account = await manager
        .getRepository(CreditAccountEntity)
        .findOne({ where: { userId: locked.userId } });
      const deduct = Math.min(locked.credits, account?.balance ?? 0);
      if (deduct > 0) {
        const remark =
          deduct < locked.credits
            ? `订单退款扣回（应扣${locked.credits}，余额不足按实际扣${deduct}）${dto.reason ? '，' + dto.reason : ''}`
            : `订单退款扣回${dto.reason ? '，' + dto.reason : ''}`;
        await this.creditsService.applyDeductFromManager(
          manager,
          locked.userId,
          deduct,
          locked.orderNo,
          remark,
        );
      }
      locked.status = 'refunded';
      await orderRepo.save(locked);

      const pay = await manager
        .getRepository(PaymentRecordEntity)
        .findOne({ where: { orderNo: locked.orderNo } });
      if (pay) {
        pay.status = 'refunded';
        pay.refundAmount = Number(locked.amount);
        pay.refundedAt = new Date();
        await manager.getRepository(PaymentRecordEntity).save(pay);
      }
    });
  }

  // ============ 发票 ============

  /** 发票列表 */
  async listInvoices(query: InvoiceQueryDto) {
    const { page, pageSize } = parsePaging(query.page, query.pageSize);
    const qb = this.invoiceRepo.createQueryBuilder('i');

    if (query.status) {
      qb.andWhere('i.status = :status', { status: query.status });
    }

    qb.orderBy('i.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    const userMap = await this.batchUsernames(items.map((i) => i.userId));
    return paginate(
      items.map((inv) => this.toInvoiceItem(inv, userMap.get(inv.userId))),
      total,
      page,
      pageSize,
    );
  }

  /** 发票详情 */
  async getInvoiceDetail(id: number) {
    const inv = await this.invoiceRepo.findOne({ where: { id } });
    if (!inv) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '发票不存在');
    }
    const username = await this.getUsername(inv.userId);
    return this.toInvoiceItem(inv, username);
  }

  /** 开具发票 */
  async issueInvoice(id: number, dto: IssueInvoiceDto) {
    const inv = await this.invoiceRepo.findOne({ where: { id } });
    if (!inv) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '发票不存在');
    }
    inv.status = 'issued';
    inv.invoiceNumber = dto.invoiceNumber;
    inv.invoiceUrl = dto.invoiceUrl;
    inv.issuedAt = new Date();
    await this.invoiceRepo.save(inv);
  }

  /** 驳回发票 */
  async rejectInvoice(id: number, dto: RejectInvoiceDto) {
    const inv = await this.invoiceRepo.findOne({ where: { id } });
    if (!inv) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '发票不存在');
    }
    inv.status = 'rejected';
    inv.rejectReason = dto.reason;
    await this.invoiceRepo.save(inv);
  }

  /** 发票审核（统一入口：action=issue/reject） */
  async auditInvoice(id: number, dto: InvoiceAuditDto) {
    if (dto.action === 'issue') {
      await this.issueInvoice(id, {
        invoiceNumber: dto.invoiceNumber || '',
        invoiceUrl: dto.invoiceUrl,
      });
    } else if (dto.action === 'reject') {
      await this.rejectInvoice(id, { reason: dto.reason || '' });
    }
  }

  // ============ 对账 ============

  /** 对账差异列表 */
  async listReconciliationDiffs(query: ReconciliationQueryDto) {
    const { page, pageSize } = parsePaging(query.page, query.pageSize);
    const qb = this.diffRepo.createQueryBuilder('d');

    if (query.type) {
      qb.andWhere('d.type = :type', { type: query.type });
    }
    if (query.status) {
      qb.andWhere('d.status = :status', { status: query.status });
    }

    qb.orderBy('d.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [items, total] = await qb.getManyAndCount();
    const userIds = items
      .map((i) => i.userId)
      .filter((u): u is number => u !== null && u !== undefined);
    const userMap = await this.batchUsernames(userIds);
    return paginate(
      items.map((d) => this.toReconciliationDiff(d, d.userId ? userMap.get(d.userId) : undefined)),
      total,
      page,
      pageSize,
    );
  }

  /** 对账差异统计 */
  async getReconciliationStats(query: ReconciliationQueryDto) {
    const baseQb = () => {
      const qb = this.diffRepo.createQueryBuilder('d');
      if (query.type) qb.andWhere('d.type = :type', { type: query.type });
      return qb;
    };

    const total = await baseQb().getCount();
    const pending = await baseQb().andWhere('d.status = :s', { s: 'pending' }).getCount();
    const resolved = await baseQb().andWhere('d.status = :s', { s: 'resolved' }).getCount();
    const ignored = await baseQb().andWhere('d.status = :s', { s: 'ignored' }).getCount();
    const sumRow = await baseQb().select('COALESCE(SUM(d.diff_amount),0)', 'sum').getRawOne<{ sum: string }>();

    return {
      total,
      pending,
      resolved,
      ignored,
      totalDiffAmount: Number(sumRow?.sum || 0),
    };
  }

  /** 手动调整对账差异 */
  async adjustReconciliationDiff(id: number, dto: AdjustReconciliationDto) {
    const diff = await this.diffRepo.findOne({ where: { id } });
    if (!diff) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '对账差异不存在');
    }
    diff.diffAmount = dto.amount;
    diff.remark = dto.remark;
    diff.status = 'resolved';
    diff.resolvedAt = new Date();
    await this.diffRepo.save(diff);
  }

  /** 标记忽略对账差异 */
  async ignoreReconciliationDiff(id: number) {
    const diff = await this.diffRepo.findOne({ where: { id } });
    if (!diff) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '对账差异不存在');
    }
    diff.status = 'ignored';
    diff.resolvedAt = new Date();
    await this.diffRepo.save(diff);
  }

  // ============ 仪表盘 ============

  /** 财务仪表盘 */
  async getDashboard() {
    const totalOrders = await this.orderRepo.count();
    const paidOrders = await this.orderRepo.count({
      where: { status: 'paid' },
    });
    const refundedOrders = await this.orderRepo.count({
      where: { status: 'refunded' },
    });
    const revenueRow = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.status = :s', { s: 'paid' })
      .select('COALESCE(SUM(o.amount),0)', 'sum')
      .getRawOne<{ sum: string }>();
    const totalTransactions = await this.txnRepo.count();
    const pendingInvoices = await this.invoiceRepo.count({
      where: { status: 'pending' },
    });
    const pendingDiffs = await this.diffRepo.count({
      where: { status: 'pending' },
    });

    return {
      orderStats: {
        total: totalOrders,
        paid: paidOrders,
        refunded: refundedOrders,
      },
      totalRevenue: Number(revenueRow?.sum || 0),
      totalTransactions,
      pendingInvoices,
      pendingDiffs,
    };
  }

  // ============ 私有辅助 ============

  /** 批量查询用户名 */
  private async batchUsernames(
    userIds: number[],
  ): Promise<Map<number, string>> {
    const ids = [...new Set(userIds.filter((id) => id !== null && id !== undefined))];
    if (ids.length === 0) return new Map();
    const users = await this.userRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.username'])
      .where('u.id IN (:...ids)', { ids })
      .getMany();
    return new Map(users.map((u) => [u.id, u.username]));
  }

  /** 查询单个用户名 */
  private async getUsername(userId: number): Promise<string | undefined> {
    const map = await this.batchUsernames([userId]);
    return map.get(userId);
  }

  /** CreditTransactionEntity -> 契约视图 */
  private toCreditTransaction(t: CreditTransactionEntity, username?: string) {
    return {
      id: t.id,
      txNo: t.sourceId,
      userId: t.userId,
      username,
      type: t.type,
      source: t.source,
      amount: t.amount,
      balanceBefore: t.balanceBefore,
      balanceAfter: t.balanceAfter,
      relatedId: t.frozenTxnId !== null && t.frozenTxnId !== undefined
        ? String(t.frozenTxnId)
        : undefined,
      remark: t.remark,
      createdAt: t.createdAt,
    };
  }

  /** RechargeOrderEntity + PaymentRecordEntity -> 契约视图 */
  private toFinanceRechargeOrder(
    o: RechargeOrderEntity,
    payment?: PaymentRecordEntity | null,
    username?: string,
  ) {
    return {
      id: o.id,
      orderNo: o.orderNo,
      userId: o.userId,
      username,
      amount: Number(o.amount),
      credits: o.credits,
      paymentMethod: o.paymentChannel || payment?.channel || 'other',
      status: o.status,
      createdAt: o.createdAt,
      paidAt: payment?.paidAt,
      refundedAt: payment?.refundedAt,
    };
  }

  /** InvoiceEntity -> 契约视图 */
  private toInvoiceItem(inv: InvoiceEntity, username?: string) {
    return {
      id: inv.id,
      applyNo: inv.applyNo,
      userId: inv.userId,
      username,
      orderNo: inv.orderNo,
      invoiceType: inv.invoiceType,
      title: inv.title,
      taxNo: inv.taxNo,
      amount: Number(inv.amount),
      status: inv.status,
      invoiceNumber: inv.invoiceNumber,
      invoiceUrl: inv.invoiceUrl,
      rejectReason: inv.rejectReason,
      createdAt: inv.createdAt,
      issuedAt: inv.issuedAt,
    };
  }

  /** ReconciliationDiffEntity -> 契约视图 */
  private toReconciliationDiff(d: ReconciliationDiffEntity, username?: string) {
    return {
      id: d.id,
      type: d.type,
      userId: d.userId,
      username,
      diffAmount: Number(d.diffAmount),
      detail: d.detail ? JSON.stringify(d.detail) : '',
      status: d.status,
      createdAt: d.createdAt,
      resolvedAt: d.resolvedAt,
      resolveRemark: d.remark,
    };
  }
}

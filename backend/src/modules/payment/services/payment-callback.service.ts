import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RechargeOrderEntity } from '../entities/recharge-order.entity';
import { PaymentRecordEntity } from '../entities/payment-record.entity';
import { PaymentConfigEntity } from '../entities/payment-config.entity';
import { CreditsService } from '../../credits/services/credits.service';
import { PaymentGatewayService } from './payment-gateway.service';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

/**
 * 支付回调服务：验签 → 幂等更新订单/支付记录 → 积分入账
 * 设计文档：docs/superpowers/specs/2026-08-10-real-payment-design.md
 * 一致性策略：同一事务内（行锁订单）先更新订单为 paid 并同步积分入账，重复回调直接返回。
 */
@Injectable()
export class PaymentCallbackService {
  private readonly logger = new Logger(PaymentCallbackService.name);

  constructor(
    @InjectRepository(PaymentConfigEntity)
    private configRepo: Repository<PaymentConfigEntity>,
    @InjectDataSource() private dataSource: DataSource,
    private readonly gateway: PaymentGatewayService,
    private readonly creditsService: CreditsService,
  ) {}

  /** 微信 V3 回调 */
  async wechatNotify(
    headers: Record<string, string | undefined>,
    rawBody: string,
  ): Promise<void> {
    const cfg = await this.getChannelConfig('wechat');
    const notice = this.gateway.verifyWechatNotify(cfg.config || {}, headers, rawBody);
    if (notice.tradeState !== 'SUCCESS') {
      this.logger.warn(`微信回调非成功状态：${notice.tradeState} order=${notice.outTradeNo}`);
      return;
    }
    if (!notice.outTradeNo) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '微信回调缺少订单号');
    }
    await this.handlePaid(notice.outTradeNo, 'wechat', notice.transactionId, { raw: rawBody.slice(0, 4000) });
  }

  /** 支付宝异步通知（form 参数） */
  async alipayNotify(params: Record<string, string>): Promise<void> {
    const cfg = await this.getChannelConfig('alipay');
    const result = this.gateway.verifyAlipayNotify(cfg.config || {}, params);
    if (!['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(result.tradeStatus)) {
      this.logger.warn(`支付宝回调非成功状态：${result.tradeStatus} order=${result.outTradeNo}`);
      return;
    }
    if (!result.outTradeNo) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '支付宝回调缺少订单号');
    }
    await this.handlePaid(result.outTradeNo, 'alipay', result.tradeNo, { params: this.sanitize(params) });
  }

  /** Stripe webhook */
  async stripeWebhook(rawBody: string, signature: string | undefined): Promise<void> {
    const cfg = await this.getChannelConfig('stripe');
    const result = this.gateway.verifyStripeWebhook(cfg.config || {}, rawBody, signature);
    if (result.type !== 'checkout.session.completed') {
      this.logger.log(`Stripe 忽略事件：${result.type}`);
      return;
    }
    if (!result.orderNo) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, 'Stripe 回调缺少订单号');
    }
    await this.handlePaid(result.orderNo, 'stripe', result.paymentIntent, { raw: rawBody.slice(0, 4000) });
  }

  /**
   * 幂等入账：行锁订单 → 已 paid/refunded 直接返回 → 同事务更新订单/支付记录 + 积分入账
   */
  private async handlePaid(
    orderNo: string,
    channel: 'wechat' | 'alipay' | 'stripe',
    txnId: string,
    raw: Record<string, unknown>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(RechargeOrderEntity);
      const order = await orderRepo
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.order_no = :no', { no: orderNo })
        .getOne();

      if (!order) {
        this.logger.warn(`支付回调订单不存在：${orderNo}`);
        BusinessException.throw(ErrorCode.NOT_FOUND, '订单不存在');
      }
      if (order.status === 'paid' || order.status === 'refunded') {
        this.logger.log(`支付回调重复/终态，跳过入账：${orderNo} status=${order.status}`);
        return;
      }

      // 积分入账（同一事务，保证订单与余额一致）
      await this.creditsService.applyRechargeFromManager(
        manager,
        order.userId,
        order.credits,
        order.orderNo,
        '充值到账',
      );

      // 更新订单
      order.status = 'paid';
      await orderRepo.save(order);

      // 更新支付记录
      const paymentRepo = manager.getRepository(PaymentRecordEntity);
      const payment = await paymentRepo.findOne({ where: { orderNo } });
      if (payment) {
        payment.status = 'paid';
        payment.paidAt = new Date();
        if (txnId) payment.paymentTxnId = txnId;
        payment.callbackRaw = raw;
        await paymentRepo.save(payment);
      }

      this.logger.log(`支付到账：order=${orderNo} user=${order.userId} credits=${order.credits} channel=${channel}`);
    });
  }

  private async getChannelConfig(channel: 'wechat' | 'alipay' | 'stripe'): Promise<PaymentConfigEntity> {
    const cfg = await this.configRepo.findOne({ where: { channel } });
    if (!cfg || !cfg.enabled || cfg.isMock) {
      BusinessException.throw(ErrorCode.FORBIDDEN, `${channel} 渠道未启用真实支付`);
    }
    return cfg;
  }

  private sanitize(params: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string') out[k] = v.slice(0, 500);
    }
    return out;
  }
}

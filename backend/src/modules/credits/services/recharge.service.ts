import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RechargeOrderEntity } from '../../payment/entities/recharge-order.entity';
import { PaymentRecordEntity } from '../../payment/entities/payment-record.entity';
import { RechargePlanEntity } from '../../payment/entities/recharge-plan.entity';
import { PaymentConfigEntity } from '../../payment/entities/payment-config.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { CreateRechargeDto } from '../dto/create-recharge.dto';

/**
 * 充值服务：档位列表（读 DB）+ 创建充值订单
 * 数据合同真源：desktop/src/api/credits-api.ts
 * - GET  /credits/recharge-plans  充值档位列表（管理后台 recharge_plans 表）
 * - POST /credits/recharge        创建充值订单（返回支付链接/二维码）
 */
@Injectable()
export class RechargeService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /** 获取启用中的充值档位列表 */
  async getRechargePlans() {
    const plans = await this.dataSource
      .getRepository(RechargePlanEntity)
      .find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', price: 'ASC' },
      });
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      credits: p.credits,
      bonusCredits: p.bonusCredits,
      price: Number(p.price),
      currency: p.currency,
      isRecommended: p.isRecommended,
    }));
  }

  /** 创建充值订单并返回支付信息 */
  async createRecharge(userId: number, dto: CreateRechargeDto) {
    const plan = await this.dataSource
      .getRepository(RechargePlanEntity)
      .findOne({ where: { id: dto.planId, isActive: true } });
    if (!plan) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '充值档位不存在或已停用');
    }

    // 校验支付渠道已启用
    const channelCfg = await this.dataSource
      .getRepository(PaymentConfigEntity)
      .findOne({ where: { channel: dto.paymentMethod } });
    if (!channelCfg || !channelCfg.enabled) {
      BusinessException.throw(ErrorCode.FORBIDDEN, '该支付方式未启用，请选择其他支付方式');
    }

    const orderNo = this.generateOrderNo();
    const payInfo = this.buildPayInfo(orderNo, dto.paymentMethod, plan);
    const totalCredits = plan.credits + plan.bonusCredits;

    // 支付记录 + 充值订单在同一事务内落库（订单与支付记录通过 order_no 关联）
    await this.dataSource.transaction(async (manager) => {
      const payment = manager.getRepository(PaymentRecordEntity).create({
        userId,
        orderNo,
        channel: dto.paymentMethod,
        amount: Number(plan.price),
        currency: plan.currency,
        status: 'pending',
        payParams: { payUrl: payInfo.payUrl, qrCode: payInfo.qrCode },
        description: `积分充值：${plan.name}`,
      });
      const savedPayment = await manager
        .getRepository(PaymentRecordEntity)
        .save(payment);

      const order = manager.getRepository(RechargeOrderEntity).create({
        orderNo,
        userId,
        packageId: plan.id,
        credits: totalCredits,
        amount: Number(plan.price),
        status: 'pending',
        paymentChannel: dto.paymentMethod,
        paymentRecordId: savedPayment.id,
      });
      await manager.getRepository(RechargeOrderEntity).save(order);
    });

    return {
      orderId: orderNo,
      payUrl: payInfo.payUrl,
      qrCode: payInfo.qrCode,
    };
  }

  /** 生成订单号：RC + 时间戳 + 随机后缀 */
  private generateOrderNo(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `RC${datePart}${randomPart}`;
  }

  /**
   * 生成支付信息
   * 说明：当前为模拟支付，返回占位链接/二维码；
   * 真实网关（微信 V3 / 支付宝 / Stripe）接入时仅需替换此方法实现。
   */
  private buildPayInfo(
    orderNo: string,
    channel: CreateRechargeDto['paymentMethod'],
    plan: RechargePlanEntity,
  ): { payUrl: string; qrCode?: string } {
    const nonce = Math.random().toString(36).slice(2, 14);
    const amount = Number(plan.price).toFixed(2);

    switch (channel) {
      case 'wechat':
        return {
          payUrl: `weixin://wxpay/bizpayurl?pr=${nonce}`,
          qrCode: `weixin://wxpay/bizpayurl?pr=${nonce}`,
        };
      case 'alipay':
        return {
          payUrl: `https://qr.alipay.com/${nonce}`,
          qrCode: `https://qr.alipay.com/${nonce}`,
        };
      case 'stripe':
      default:
        return {
          payUrl: `https://checkout.stripe.com/pay/${nonce}?orderNo=${orderNo}&amount=${amount}`,
        };
    }
  }
}

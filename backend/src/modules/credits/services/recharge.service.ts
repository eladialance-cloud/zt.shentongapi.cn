import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RechargeOrderEntity } from '../../payment/entities/recharge-order.entity';
import { PaymentRecordEntity } from '../../payment/entities/payment-record.entity';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';
import { CreateRechargeDto } from '../dto/create-recharge.dto';

/** 充值套餐 */
export interface RechargePlan {
  id: number;
  name: string;
  credits: number;
  bonusCredits: number;
  price: number;
  currency: string;
  isRecommended: boolean;
}

/**
 * 内置充值套餐种子（recharge_plans 表上线前以静态配置兜底）
 * 数据合同真源：desktop/src/types/credits.ts RechargePlan
 */
const RECHARGE_PLANS: RechargePlan[] = [
  { id: 1, name: '体验包', credits: 100, bonusCredits: 0, price: 10, currency: 'CNY', isRecommended: false },
  { id: 2, name: '基础包', credits: 500, bonusCredits: 20, price: 48, currency: 'CNY', isRecommended: false },
  { id: 3, name: '标准包', credits: 1000, bonusCredits: 100, price: 88, currency: 'CNY', isRecommended: true },
  { id: 4, name: '进阶包', credits: 3000, bonusCredits: 400, price: 248, currency: 'CNY', isRecommended: false },
  { id: 5, name: '尊享包', credits: 5000, bonusCredits: 800, price: 398, currency: 'CNY', isRecommended: false },
];

/**
 * 充值服务：套餐列表 + 创建充值订单
 * 数据合同真源：desktop/src/api/credits-api.ts
 * - GET  /credits/recharge-plans  充值套餐列表
 * - POST /credits/recharge        创建充值订单（返回支付链接/二维码）
 */
@Injectable()
export class RechargeService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /** 获取充值套餐列表 */
  getRechargePlans(): RechargePlan[] {
    return RECHARGE_PLANS.map((plan) => ({ ...plan }));
  }

  /** 创建充值订单并返回支付信息 */
  async createRecharge(userId: number, dto: CreateRechargeDto) {
    const plan = RECHARGE_PLANS.find((p) => p.id === dto.planId);
    if (!plan) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '充值套餐不存在');
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
        amount: plan.price,
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
        amount: plan.price,
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
   * 说明：支付网关（微信 V3 / 支付宝 / Stripe）接入前返回模拟占位链接/二维码，
   * 字段结构与真实网关一致，网关接入后仅需替换此方法实现。
   */
  private buildPayInfo(
    orderNo: string,
    channel: CreateRechargeDto['paymentMethod'],
    plan: RechargePlan,
  ): { payUrl: string; qrCode?: string } {
    const nonce = Math.random().toString(36).slice(2, 14);
    const amount = plan.price.toFixed(2);

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

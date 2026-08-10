import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { ErrorCode } from '../../../common/constants/error.constant';

/**
 * 真实支付网关服务（微信 Native V3 / 支付宝当面付 / Stripe Checkout）
 * 设计文档：docs/superpowers/specs/2026-08-10-real-payment-design.md
 * 说明：零第三方依赖，使用 node:crypto + 内置 fetch（Node 18+）。
 * 渠道配置来自 payment_configs.config（管理后台录入）。
 */

export type PaymentChannel = 'wechat' | 'alipay' | 'stripe';

export interface GatewayOrderParams {
  orderNo: string;
  /** 金额（元） */
  amount: number;
  /** 货币代码，默认 CNY */
  currency?: string;
  description: string;
  config: Record<string, unknown>;
}

export interface GatewayOrderResult {
  /** 二维码内容（微信 code_url / 支付宝 qr_code） */
  qrCode?: string;
  /** 跳转链接（Stripe checkout url） */
  payUrl?: string;
}

export interface GatewayRefundParams {
  orderNo: string;
  refundNo: string;
  /** 退款金额（元） */
  amount: number;
  /** 原订单金额（元），微信退款校验用 */
  totalAmount: number;
  config: Record<string, unknown>;
  /** 渠道交易号（支付成功时记录的 paymentTxnId） */
  transactionId?: string;
}

/** 微信 V3 回调解密后的支付通知 */
export interface WechatPayNotice {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  successTime?: string;
  amount?: { total?: number; payerTotal?: number };
}

@Injectable()
export class PaymentGatewayService {
  // ============ 下单 ============

  async createOrder(
    channel: PaymentChannel,
    params: GatewayOrderParams,
  ): Promise<GatewayOrderResult> {
    switch (channel) {
      case 'wechat':
        return this.createWechatNativeOrder(params);
      case 'alipay':
        return this.createAlipayPrecreate(params);
      case 'stripe':
        return this.createStripeSession(params);
      default:
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, '不支持的支付渠道');
    }
  }

  // ---------- 微信 Native（V3） ----------

  private async createWechatNativeOrder(
    params: GatewayOrderParams,
  ): Promise<GatewayOrderResult> {
    const cfg = params.config;
    const appid = this.requireStr(cfg, 'appId', '微信 AppID');
    const mchid = this.requireStr(cfg, 'mchId', '微信商户号');
    const serialNo = this.requireStr(cfg, 'serialNo', '微信商户证书序列号');
    const privateKey = this.requireStr(cfg, 'privateKey', '微信商户API私钥');
    const notifyUrl = this.requireStr(cfg, 'notifyUrl', '微信支付回调地址');

    const body = JSON.stringify({
      appid,
      mchid,
      description: params.description,
      out_trade_no: params.orderNo,
      notify_url: notifyUrl,
      amount: {
        total: Math.round(params.amount * 100),
        currency: params.currency || 'CNY',
      },
    });

    const urlPath = '/v3/pay/transactions/native';
    const resp = await this.httpJson(
      'POST',
      'https://api.mch.weixin.qq.com' + urlPath,
      body,
      {
        Authorization: this.buildWechatAuthHeader('POST', urlPath, body, mchid, serialNo, privateKey),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    );
    const codeUrl = (resp as { code_url?: string }).code_url;
    if (!codeUrl) {
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, '微信下单失败：未返回 code_url');
    }
    return { qrCode: codeUrl };
  }

  /** 微信 V3 请求头签名：WECHATPAY2-SHA256-RSA2048 */
  private buildWechatAuthHeader(
    method: string,
    urlPath: string,
    body: string,
    mchid: string,
    serialNo: string,
    privateKey: string,
  ): string {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const message = `${method}\n${urlPath}\n${timestamp}\n${nonce}\n${body}\n`;
    const signature = crypto
      .sign('RSA-SHA256', Buffer.from(message, 'utf8'), this.parsePem(privateKey))
      .toString('base64');
    return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`;
  }

  // ---------- 支付宝当面付（alipay.trade.precreate） ----------

  private async createAlipayPrecreate(
    params: GatewayOrderParams,
  ): Promise<GatewayOrderResult> {
    const cfg = params.config;
    const appId = this.requireStr(cfg, 'appId', '支付宝应用 AppID');
    const privateKey = this.requireStr(cfg, 'merchantPrivateKey', '支付宝应用私钥');
    const notifyUrl = this.requireStr(cfg, 'notifyUrl', '支付宝回调地址');

    const bizContent = JSON.stringify({
      out_trade_no: params.orderNo,
      total_amount: params.amount.toFixed(2),
      subject: params.description,
    });

    const commonParams: Record<string, string> = {
      app_id: appId,
      method: 'alipay.trade.precreate',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: this.alipayTimestamp(),
      version: '1.0',
      notify_url: notifyUrl,
      biz_content: bizContent,
    };

    const signed = this.alipaySign(commonParams, privateKey);
    const resp = await this.httpForm(
      'https://openapi.alipay.com/gateway.do',
      signed,
    );

    const body = (resp as {
      alipay_trade_precreate_response?: { code?: string; msg?: string; qr_code?: string; sub_msg?: string };
    }).alipay_trade_precreate_response;

    if (!body || body.code !== '10000') {
      BusinessException.throw(
        ErrorCode.INTERNAL_ERROR,
        `支付宝下单失败：${body?.sub_msg || body?.msg || '未知错误'}`,
      );
    }
    if (!body.qr_code) {
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, '支付宝下单失败：未返回二维码');
    }
    return { qrCode: body.qr_code };
  }

  /** 支付宝 RSA2 签名：参数（不含 sign/sign_type）按 key 字典序拼接原始值 */
  private alipaySign(
    params: Record<string, string>,
    privateKey: string,
  ): Record<string, string> {
    const signStr = Object.keys(params)
      .filter((k) => k !== 'sign' && k !== 'sign_type')
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const sign = crypto
      .sign('RSA-SHA256', Buffer.from(signStr, 'utf8'), this.parsePem(privateKey))
      .toString('base64');
    return { ...params, sign_type: 'RSA2', sign };
  }

  private alipayTimestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // ---------- Stripe Checkout ----------

  private async createStripeSession(
    params: GatewayOrderParams,
  ): Promise<GatewayOrderResult> {
    const cfg = params.config;
    const secretKey = this.requireStr(cfg, 'secretKey', 'Stripe Secret Key');
    const successUrl = this.requireStr(cfg, 'successUrl', 'Stripe 成功跳转地址');
    const cancelUrl = this.requireStr(cfg, 'cancelUrl', 'Stripe 取消跳转地址');

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('client_reference_id', params.orderNo);
    form.set('success_url', successUrl);
    form.set('cancel_url', cancelUrl);
    form.set('line_items[0][quantity]', '1');
    form.set(
      'line_items[0][price_data][currency]',
      (params.currency || 'CNY').toLowerCase(),
    );
    form.set(
      'line_items[0][price_data][unit_amount]',
      String(Math.round(params.amount * 100)),
    );
    form.set('line_items[0][price_data][product_data][name]', params.description);

    const resp = await this.httpJson(
      'POST',
      'https://api.stripe.com/v1/checkout/sessions',
      form.toString(),
      {
        Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    );
    const url = (resp as { url?: string }).url;
    if (!url) {
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, 'Stripe 下单失败：未返回支付链接');
    }
    return { payUrl: url };
  }

  // ============ 退款 ============

  async refund(channel: PaymentChannel, params: GatewayRefundParams): Promise<void> {
    switch (channel) {
      case 'wechat':
        return this.refundWechat(params);
      case 'alipay':
        return this.refundAlipay(params);
      case 'stripe':
        return this.refundStripe(params);
      default:
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, '不支持的支付渠道');
    }
  }

  private async refundWechat(params: GatewayRefundParams): Promise<void> {
    const cfg = params.config;
    const mchid = this.requireStr(cfg, 'mchId', '微信商户号');
    const serialNo = this.requireStr(cfg, 'serialNo', '微信商户证书序列号');
    const privateKey = this.requireStr(cfg, 'privateKey', '微信商户API私钥');

    const body = JSON.stringify({
      out_trade_no: params.orderNo,
      out_refund_no: params.refundNo,
      amount: {
        refund: Math.round(params.amount * 100),
        total: Math.round(params.totalAmount * 100),
        currency: 'CNY',
      },
    });
    const urlPath = '/v3/refund/domestic/refunds';
    const resp = await this.httpJson(
      'POST',
      'https://api.mch.weixin.qq.com' + urlPath,
      body,
      {
        Authorization: this.buildWechatAuthHeader('POST', urlPath, body, mchid, serialNo, privateKey),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    );
    const status = (resp as { status?: string }).status;
    if (status !== 'SUCCESS' && status !== 'PROCESSING') {
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, `微信退款失败：${status || '未知状态'}`);
    }
  }

  private async refundAlipay(params: GatewayRefundParams): Promise<void> {
    const cfg = params.config;
    const appId = this.requireStr(cfg, 'appId', '支付宝应用 AppID');
    const privateKey = this.requireStr(cfg, 'merchantPrivateKey', '支付宝应用私钥');

    const bizContent = JSON.stringify({
      out_trade_no: params.orderNo,
      refund_amount: params.amount.toFixed(2),
    });
    const commonParams: Record<string, string> = {
      app_id: appId,
      method: 'alipay.trade.refund',
      format: 'JSON',
      charset: 'utf-8',
      sign_type: 'RSA2',
      timestamp: this.alipayTimestamp(),
      version: '1.0',
      biz_content: bizContent,
    };
    const signed = this.alipaySign(commonParams, privateKey);
    const resp = await this.httpForm('https://openapi.alipay.com/gateway.do', signed);
    const body = (resp as {
      alipay_trade_refund_response?: { code?: string; msg?: string; sub_msg?: string };
    }).alipay_trade_refund_response;
    if (!body || body.code !== '10000') {
      BusinessException.throw(
        ErrorCode.INTERNAL_ERROR,
        `支付宝退款失败：${body?.sub_msg || body?.msg || '未知错误'}`,
      );
    }
  }

  private async refundStripe(params: GatewayRefundParams): Promise<void> {
    const cfg = params.config;
    const secretKey = this.requireStr(cfg, 'secretKey', 'Stripe Secret Key');
    if (!params.transactionId) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, 'Stripe 退款缺少支付意图 ID');
    }
    const form = new URLSearchParams();
    form.set('payment_intent', params.transactionId);
    form.set('amount', String(Math.round(params.amount * 100)));
    await this.httpJson('POST', 'https://api.stripe.com/v1/refunds', form.toString(), {
      Authorization: 'Basic ' + Buffer.from(secretKey + ':').toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    });
  }

  // ============ 回调验签/解密 ============

  /** 微信 V3 回调验签（平台公钥） + AES-256-GCM 解密 */
  verifyWechatNotify(
    config: Record<string, unknown>,
    headers: Record<string, string | undefined>,
    rawBody: string,
  ): WechatPayNotice {
    const apiV3Key = this.requireStr(config, 'apiV3Key', '微信 APIv3 密钥');
    const platformPublicKey = this.requireStr(config, 'platformPublicKey', '微信支付平台公钥');

    const timestamp = headers['wechatpay-timestamp'] || '';
    const nonce = headers['wechatpay-nonce'] || '';
    const signature = headers['wechatpay-signature'] || '';
    if (!timestamp || !nonce || !signature) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '微信回调缺少验签头');
    }
    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const valid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(message, 'utf8'),
      this.parsePem(platformPublicKey),
      Buffer.from(signature, 'base64'),
    );
    if (!valid) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '微信回调验签失败');
    }

    const body = JSON.parse(rawBody) as {
      resource?: { ciphertext?: string; nonce?: string; associated_data?: string };
    };
    const resource = body.resource;
    if (!resource?.ciphertext || !resource?.nonce) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '微信回调缺少 resource');
    }
    const plain = this.aesGcmDecrypt(apiV3Key, resource.ciphertext, resource.nonce, resource.associated_data);
    const notice = JSON.parse(plain) as {
      out_trade_no?: string;
      transaction_id?: string;
      trade_state?: string;
      success_time?: string;
      amount?: { total?: number; payer_total?: number };
    };
    return {
      outTradeNo: notice.out_trade_no || '',
      transactionId: notice.transaction_id || '',
      tradeState: notice.trade_state || '',
      successTime: notice.success_time,
      amount: notice.amount,
    };
  }

  /** 支付宝回调验签（RSA2 + 支付宝公钥） */
  verifyAlipayNotify(
    config: Record<string, unknown>,
    params: Record<string, string>,
  ): { outTradeNo: string; tradeNo: string; tradeStatus: string } {
    const alipayPublicKey = this.requireStr(config, 'alipayPublicKey', '支付宝公钥');
    const sign = params.sign || '';
    if (!sign) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '支付宝回调缺少签名');
    }
    const signStr = Object.keys(params)
      .filter((k) => k !== 'sign' && k !== 'sign_type')
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    const valid = crypto.verify(
      'RSA-SHA256',
      Buffer.from(signStr, 'utf8'),
      this.parsePem(alipayPublicKey),
      Buffer.from(sign, 'base64'),
    );
    if (!valid) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '支付宝回调验签失败');
    }
    return {
      outTradeNo: params.out_trade_no || '',
      tradeNo: params.trade_no || '',
      tradeStatus: params.trade_status || '',
    };
  }

  /** Stripe webhook 验签（HMAC-SHA256） */
  verifyStripeWebhook(
    config: Record<string, unknown>,
    rawBody: string,
    signatureHeader: string | undefined,
  ): { orderNo: string; paymentIntent: string; type: string } {
    const webhookSecret = this.requireStr(config, 'webhookSecret', 'Stripe Webhook Secret');
    if (!signatureHeader) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, 'Stripe 缺少签名头');
    }
    const parts = new Map<string, string>();
    for (const item of signatureHeader.split(',')) {
      const [k, v] = item.trim().split('=');
      if (k && v) parts.set(k, v);
    }
    const timestamp = parts.get('t') || '';
    const v1 = parts.get('v1') || '';
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, 'Stripe 回调验签失败');
    }

    const event = JSON.parse(rawBody) as {
      type?: string;
      data?: {
        object?: {
          client_reference_id?: string;
          payment_intent?: string;
        };
      };
    };
    return {
      type: event.type || '',
      orderNo: event.data?.object?.client_reference_id || '',
      paymentIntent: event.data?.object?.payment_intent || '',
    };
  }

  // ============ 工具 ============

  private aesGcmDecrypt(
    apiV3Key: string,
    ciphertext: string,
    nonce: string,
    associatedData?: string,
  ): string {
    const key = Buffer.from(apiV3Key, 'utf8');
    if (key.length !== 32) {
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, 'APIv3 密钥长度必须为 32 字节');
    }
    const data = Buffer.from(ciphertext, 'base64');
    const authTag = data.subarray(data.length - 16);
    const encrypted = data.subarray(0, data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'utf8'));
    decipher.setAuthTag(authTag);
    if (associatedData) decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    try {
      return decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
    } catch {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '微信回调解密失败');
    }
  }

  private parsePem(key: string): crypto.KeyObject {
    try {
      const normalized = key.includes('-----BEGIN') ? key : this.wrapPem(key);
      return crypto.createPrivateKey(normalized) as crypto.KeyObject;
    } catch {
      try {
        return crypto.createPublicKey(
          key.includes('-----BEGIN') ? key : this.wrapPem(key),
        ) as crypto.KeyObject;
      } catch {
        BusinessException.throw(ErrorCode.VALIDATION_FAILED, '密钥格式不正确（需要 PEM 格式）');
      }
    }
  }

  /** 兼容用户粘贴裸 base64（无 PEM 头尾）时自动包装 */
  private wrapPem(base64: string): string {
    const body = base64.replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g) || [body];
    return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
  }

  private requireStr(cfg: Record<string, unknown>, key: string, label: string): string {
    const v = cfg[key];
    if (typeof v !== 'string' || v.trim() === '') {
      BusinessException.throw(ErrorCode.FORBIDDEN, `${label}未配置`);
    }
    return v.trim();
  }

  private async httpJson(
    method: string,
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<unknown> {
    const resp = await fetch(url, { method, headers, body });
    const text = await resp.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) {
      const detail = JSON.stringify(data).slice(0, 500);
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, `上游请求失败(${resp.status})：${detail}`);
    }
    return data;
  }

  private async httpForm(
    url: string,
    params: Record<string, string>,
  ): Promise<unknown> {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) form.set(k, v);
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const text = await resp.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) {
      const detail = JSON.stringify(data).slice(0, 500);
      BusinessException.throw(ErrorCode.INTERNAL_ERROR, `支付宝请求失败(${resp.status})：${detail}`);
    }
    return data;
  }
}

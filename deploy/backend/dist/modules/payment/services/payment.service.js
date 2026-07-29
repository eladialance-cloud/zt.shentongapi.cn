"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PaymentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto = __importStar(require("crypto"));
const config_1 = require("@nestjs/config");
const fs = __importStar(require("fs"));
const wechatpay_node_v3_1 = __importDefault(require("wechatpay-node-v3"));
const alipay_sdk_1 = require("alipay-sdk");
const stripe_1 = __importDefault(require("stripe"));
const payment_record_entity_1 = require("../entities/payment-record.entity");
const recharge_order_entity_1 = require("../entities/recharge-order.entity");
const membership_plan_entity_1 = require("../entities/membership-plan.entity");
const credit_account_entity_1 = require("../../credits/entities/credit-account.entity");
const credit_transaction_entity_1 = require("../../credits/entities/credit-transaction.entity");
const credits_service_1 = require("../../credits/services/credits.service");
const redis_service_1 = require("../../../common/services/redis.service");
const business_exception_1 = require("../../../common/exceptions/business.exception");
const error_constant_1 = require("../../../common/constants/error.constant");
const system_config_entity_1 = require("../../admin-system/entities/system-config.entity");
const encryption_service_1 = require("../../../common/services/encryption.service");
let PaymentService = class PaymentService {
    static { PaymentService_1 = this; }
    paymentRepo;
    orderRepo;
    planRepo;
    configRepo;
    creditsService;
    redis;
    config;
    encryptionService;
    dataSource;
    logger = new common_1.Logger(PaymentService_1.name);
    static PLANS_CACHE_KEY = 'cache:plans:list';
    static PLANS_CACHE_TTL = 3600;
    wechatPay = null;
    alipaySdk = null;
    stripeClient = null;
    constructor(paymentRepo, orderRepo, planRepo, configRepo, creditsService, redis, config, encryptionService, dataSource) {
        this.paymentRepo = paymentRepo;
        this.orderRepo = orderRepo;
        this.planRepo = planRepo;
        this.configRepo = configRepo;
        this.creditsService = creditsService;
        this.redis = redis;
        this.config = config;
        this.encryptionService = encryptionService;
        this.dataSource = dataSource;
    }
    async createRechargeOrder(userId, packageId, credits, amount, channel) {
        if (amount <= 0) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '充值金额必须大于 0');
        }
        if (credits <= 0) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '充值积分数量必须大于 0');
        }
        const orderNo = this.generateOrderNo();
        const order = this.orderRepo.create({
            orderNo,
            userId,
            packageId: packageId ?? undefined,
            credits,
            amount,
            status: 'pending',
            paymentChannel: channel,
        });
        return this.orderRepo.save(order);
    }
    async initiatePayment(orderNo, channel, subMethod) {
        const order = await this.orderRepo.findOne({ where: { orderNo } });
        if (!order)
            throw new common_1.NotFoundException('订单不存在');
        if (order.status !== 'pending') {
            throw new common_1.BadRequestException('订单状态不允许支付');
        }
        const payment = this.paymentRepo.create({
            userId: order.userId,
            orderNo: order.orderNo,
            channel,
            subMethod: subMethod,
            amount: order.amount,
            currency: 'CNY',
            status: 'pending',
            description: `充值 ${order.credits} 积分`,
        });
        const saved = await this.paymentRepo.save(payment);
        const payParams = await this.generatePayParams(channel, subMethod, {
            orderNo: order.orderNo,
            amount: Number(order.amount),
            description: payment.description || '',
        });
        saved.payParams = payParams;
        await this.paymentRepo.save(saved);
        order.paymentRecordId = saved.id;
        await this.orderRepo.save(order);
        return {
            paymentId: saved.id,
            orderNo: order.orderNo,
            payParams,
        };
    }
    async handlePaymentCallback(channel, callbackData) {
        const verified = await this.verifyCallbackSignature(channel, callbackData);
        if (!verified) {
            return { success: false };
        }
        const orderNo = callbackData.out_trade_no;
        const txnId = callbackData.transaction_id;
        let amount;
        if (channel === 'wechat' && callbackData.amount && typeof callbackData.amount === 'object') {
            amount = Number(callbackData.amount.total || 0) / 100;
        }
        else {
            amount = Number(callbackData.total_amount || callbackData.amount || 0);
        }
        if (!orderNo) {
            this.logger.warn('回调缺少 out_trade_no');
            return { success: false };
        }
        return this.dataSource.transaction(async (manager) => {
            const order = await manager.findOne(recharge_order_entity_1.RechargeOrderEntity, {
                where: { orderNo },
                lock: { mode: 'pessimistic_write' },
            });
            if (!order)
                throw new common_1.NotFoundException('订单不存在');
            if (order.status === 'paid') {
                return { success: true, orderNo };
            }
            const orderAmount = Number(order.amount);
            if (Math.abs(orderAmount - amount) > 0.01) {
                throw new common_1.BadRequestException('金额不匹配');
            }
            order.status = 'paid';
            await manager.save(order);
            await manager.update(payment_record_entity_1.PaymentRecordEntity, { orderNo }, {
                status: 'paid',
                paymentTxnId: txnId,
                paidAt: new Date(),
                callbackRaw: callbackData,
            });
            await this.creditsService.rechargeCredits(order.userId, order.credits, order.orderNo, `充值 ${order.credits} 积分`);
            return { success: true, orderNo };
        });
    }
    async getOrderStatus(orderNo, userId) {
        const order = await this.orderRepo.findOne({
            where: { orderNo, userId },
        });
        if (!order)
            throw new common_1.NotFoundException('订单不存在');
        return {
            orderNo: order.orderNo,
            status: order.status,
            credits: order.credits,
            amount: order.amount,
            createdAt: order.createdAt,
            paidAt: order.updatedAt,
        };
    }
    async getUserOrders(userId, page = 1, pageSize = 20) {
        const [list, total] = await this.orderRepo.findAndCount({
            where: { userId },
            order: { createdAt: 'DESC' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        });
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize) || 0,
        };
    }
    async getPlans() {
        const cached = await this.redis.get(PaymentService_1.PLANS_CACHE_KEY);
        if (cached) {
            try {
                return JSON.parse(cached);
            }
            catch {
            }
        }
        const result = await this.planRepo.find({
            where: { isActive: true },
            order: { price: 'ASC' },
        });
        await this.redis.set(PaymentService_1.PLANS_CACHE_KEY, JSON.stringify(result), PaymentService_1.PLANS_CACHE_TTL);
        return result;
    }
    async createPlan(data) {
        const saved = await this.planRepo.save(this.planRepo.create(data));
        await this.redis.del(PaymentService_1.PLANS_CACHE_KEY);
        return saved;
    }
    async updatePlan(id, data) {
        await this.planRepo.update(id, data);
        await this.redis.del(PaymentService_1.PLANS_CACHE_KEY);
    }
    async deletePlan(id) {
        await this.planRepo.delete(id);
        await this.redis.del(PaymentService_1.PLANS_CACHE_KEY);
    }
    async refundOrder(orderId, adminId, reason) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order)
            throw new common_1.NotFoundException('订单不存在');
        if (order.status !== 'paid') {
            throw new common_1.BadRequestException('只能退款已支付的订单');
        }
        return this.dataSource.transaction(async (manager) => {
            order.status = 'refunded';
            await manager.save(order);
            await manager.update(payment_record_entity_1.PaymentRecordEntity, { orderNo: order.orderNo }, {
                status: 'refunded',
                refundAmount: order.amount,
                refundedAt: new Date(),
            });
            const account = await this.creditsService.getOrCreateAccount(order.userId);
            const balanceBefore = account.balance;
            const balanceAfter = balanceBefore - order.credits;
            await manager.update(credit_account_entity_1.CreditAccountEntity, { id: account.id }, {
                balance: balanceAfter,
                version: account.version + 1,
                totalConsumed: account.totalConsumed + order.credits,
            });
            const txn = manager.getRepository(credit_transaction_entity_1.CreditTransactionEntity).create({
                userId: order.userId,
                type: 'refund_deduct',
                amount: -order.credits,
                balanceBefore,
                balanceAfter,
                source: 'refund',
                sourceId: `refund_${order.id}`,
                adminId,
                remark: `订单退款 ${order.orderNo}: ${reason}`,
            });
            await manager.save(txn);
            return { success: true };
        });
    }
    async loadPaymentConfig() {
        const row = await this.configRepo.findOne({ where: { section: 'payment' } });
        if (row && row.configValue) {
            return row.configValue;
        }
        return {};
    }
    async getWechatConfig() {
        const dbConfig = await this.loadPaymentConfig();
        const wechat = (dbConfig.wechat || {});
        return {
            appId: wechat.appId || this.config.get('WECHAT_APP_ID') || '',
            mchId: wechat.mchId || this.config.get('WECHAT_MCH_ID') || '',
            apiV3Key: wechat.apiV3Key || this.config.get('WECHAT_API_V3_KEY') || '',
            serialNo: wechat.serialNo || this.config.get('WECHAT_SERIAL_NO') || '',
            privateKeyPath: wechat.privateKeyPath || this.config.get('WECHAT_PRIVATE_KEY_PATH') || '',
            publicKeyPath: wechat.publicKeyPath || this.config.get('WECHAT_PUBLIC_KEY_PATH') || '',
            notifyUrl: wechat.notifyUrl || this.config.get('WECHAT_NOTIFY_URL') || '',
            callbackIps: wechat.callbackIps || this.config.get('WECHAT_CALLBACK_IPS') || '',
            enabled: wechat.enabled ?? !!this.config.get('WECHAT_APP_ID'),
        };
    }
    async getAlipayConfig() {
        const dbConfig = await this.loadPaymentConfig();
        const alipay = (dbConfig.alipay || {});
        return {
            appId: alipay.appId || this.config.get('ALIPAY_APP_ID') || '',
            privateKey: alipay.privateKey || this.config.get('ALIPAY_PRIVATE_KEY') || '',
            publicKey: alipay.publicKey || this.config.get('ALIPAY_PUBLIC_KEY') || '',
            notifyUrl: alipay.notifyUrl || this.config.get('ALIPAY_NOTIFY_URL') || '',
            enabled: alipay.enabled ?? !!this.config.get('ALIPAY_APP_ID'),
        };
    }
    async getStripeConfig() {
        const dbConfig = await this.loadPaymentConfig();
        const stripe = (dbConfig.stripe || {});
        return {
            secretKey: stripe.secretKey || this.config.get('STRIPE_SECRET_KEY') || '',
            webhookSecret: stripe.webhookSecret || this.config.get('STRIPE_WEBHOOK_SECRET') || '',
            enabled: stripe.enabled ?? !!this.config.get('STRIPE_SECRET_KEY'),
        };
    }
    generateOrderNo() {
        const date = new Date();
        const dateStr = date.getFullYear().toString() +
            String(date.getMonth() + 1).padStart(2, '0') +
            String(date.getDate()).padStart(2, '0');
        const random = crypto.randomBytes(8).toString('hex').toUpperCase();
        return `RO${dateStr}${random}`;
    }
    async generatePayParams(channel, subMethod, params) {
        switch (channel) {
            case 'wechat':
                return this.generateWechatPayParams(params);
            case 'alipay':
                return this.generateAlipayParams(params);
            case 'stripe':
                return this.generateStripeParams(params);
            default:
                throw new common_1.BadRequestException(`不支持的支付渠道: ${channel}`);
        }
    }
    async initWechatPay() {
        if (this.wechatPay)
            return;
        const cfg = await this.getWechatConfig();
        if (!cfg.enabled || !cfg.appId || !cfg.mchId || !cfg.apiV3Key || !cfg.serialNo || !cfg.privateKeyPath) {
            this.logger.warn('微信支付凭证未配置，微信渠道已禁用');
            return;
        }
        try {
            const privateKey = fs.readFileSync(cfg.privateKeyPath);
            const publicKey = cfg.publicKeyPath
                ? fs.readFileSync(cfg.publicKeyPath)
                : Buffer.from('');
            this.wechatPay = new wechatpay_node_v3_1.default({
                appid: cfg.appId,
                mchid: cfg.mchId,
                privateKey,
                publicKey,
                key: cfg.apiV3Key,
                serial_no: cfg.serialNo,
            });
            this.logger.log('微信支付 V3 客户端初始化成功');
        }
        catch (err) {
            this.logger.error(`微信支付初始化失败: ${err.message}`);
        }
    }
    async generateWechatPayParams(params) {
        if (!this.wechatPay) {
            await this.initWechatPay();
        }
        if (!this.wechatPay) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.PAYMENT_CHANNEL_DISABLED, '微信支付渠道未启用');
        }
        const cfg = await this.getWechatConfig();
        const notifyUrl = cfg.notifyUrl;
        if (!notifyUrl) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.PAYMENT_CHANNEL_DISABLED, '微信支付回调地址未配置');
        }
        const result = await this.wechatPay.transactions_native({
            description: params.description,
            out_trade_no: params.orderNo,
            notify_url: notifyUrl,
            amount: {
                total: Math.round(params.amount * 100),
                currency: 'CNY',
            },
        });
        if (result.status !== 200 || result.error) {
            this.logger.error(`微信支付下单失败: status=${result.status}, error=${JSON.stringify(result.error)}`);
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.PAYMENT_CHANNEL_DISABLED, `微信支付下单失败: ${result.errRaw?.message || '未知错误'}`);
        }
        const data = (result.data || {});
        return {
            code_url: data.code_url,
            prepay_id: data.prepay_id,
        };
    }
    async initAlipay() {
        if (this.alipaySdk)
            return;
        const cfg = await this.getAlipayConfig();
        if (!cfg.enabled || !cfg.appId || !cfg.privateKey || !cfg.publicKey) {
            this.logger.warn('支付宝凭证未配置，支付宝渠道已禁用');
            return;
        }
        try {
            this.alipaySdk = new alipay_sdk_1.AlipaySdk({
                appId: cfg.appId,
                privateKey: cfg.privateKey,
                alipayPublicKey: cfg.publicKey,
                signType: 'RSA2',
            });
            this.logger.log('支付宝客户端初始化成功');
        }
        catch (err) {
            this.logger.error(`支付宝初始化失败: ${err.message}`);
        }
    }
    async generateAlipayParams(params) {
        if (!this.alipaySdk) {
            await this.initAlipay();
        }
        if (!this.alipaySdk) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.PAYMENT_CHANNEL_DISABLED, '支付宝渠道未启用');
        }
        const cfg = await this.getAlipayConfig();
        const notifyUrl = cfg.notifyUrl;
        const result = await this.alipaySdk.exec('alipay.trade.precreate', {
            bizContent: {
                out_trade_no: params.orderNo,
                total_amount: params.amount.toFixed(2),
                subject: params.description,
            },
            notify_url: notifyUrl,
        });
        if (result.code !== '10000') {
            this.logger.error(`支付宝预创建失败: code=${result.code}, msg=${result.msg}, sub_code=${result.sub_code}, sub_msg=${result.sub_msg}`);
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.PAYMENT_CHANNEL_DISABLED, `支付宝预创建失败: ${result.sub_msg || result.msg}`);
        }
        return {
            qr_code: result.qrCode || result.qr_code,
            out_trade_no: params.orderNo,
        };
    }
    async initStripe() {
        if (this.stripeClient)
            return;
        const cfg = await this.getStripeConfig();
        if (!cfg.enabled || !cfg.secretKey) {
            this.logger.warn('Stripe 凭证未配置，Stripe 渠道已禁用');
            return;
        }
        try {
            this.stripeClient = new stripe_1.default(cfg.secretKey, {
                apiVersion: '2024-06-20',
            });
            this.logger.log('Stripe 客户端初始化成功');
        }
        catch (err) {
            this.logger.error(`Stripe 初始化失败: ${err.message}`);
        }
    }
    async generateStripeParams(params) {
        if (!this.stripeClient) {
            await this.initStripe();
        }
        if (!this.stripeClient) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.PAYMENT_CHANNEL_DISABLED, 'Stripe 渠道未启用');
        }
        const intent = await this.stripeClient.paymentIntents.create({
            amount: Math.round(params.amount * 100),
            currency: 'cny',
            metadata: { order_no: params.orderNo },
            description: params.description,
        });
        return {
            client_secret: intent.client_secret,
            payment_intent_id: intent.id,
        };
    }
    async verifyCallbackSignature(channel, data) {
        try {
            if (channel === 'wechat') {
                const cfg = await this.getWechatConfig();
                if (cfg.callbackIps) {
                    const clientIP = data['client-ip'];
                    if (clientIP) {
                        const ipRanges = cfg.callbackIps.split(',').map((s) => s.trim());
                        const isAllowed = ipRanges.some((range) => clientIP.startsWith(range));
                        if (!isAllowed) {
                            this.logger.error(`微信支付回调 IP 不在白名单: ${clientIP}`);
                            return false;
                        }
                    }
                }
                const signature = data['wechatpay-signature'];
                const serial = data['wechatpay-serial'];
                const nonce = data['wechatpay-nonce'];
                const timestamp = data['wechatpay-timestamp'];
                const body = data.body;
                if (!signature || !nonce || !timestamp || !body) {
                    this.logger.error('微信支付 V3 回调缺少必要的头信息或 body');
                    return false;
                }
                const age = Math.floor(Date.now() / 1000) - Number(timestamp);
                if (age > 300) {
                    this.logger.warn(`微信支付回调时间戳过期 (${age}s)`);
                    return false;
                }
                const publicKeyPath = cfg.publicKeyPath;
                if (publicKeyPath) {
                    try {
                        const publicKey = fs.readFileSync(publicKeyPath, 'utf-8');
                        const bodyStr = JSON.stringify(body);
                        const verifyStr = `${timestamp}\n${nonce}\n${bodyStr}\n`;
                        const verify = crypto.createVerify('RSA-SHA256');
                        verify.update(verifyStr, 'utf8');
                        const isValid = verify.verify(publicKey, Buffer.from(signature, 'base64'));
                        if (!isValid) {
                            this.logger.error('微信支付 V3 回调 RSA-SHA256 验签失败');
                            return false;
                        }
                        this.logger.log('微信支付 V3 回调 RSA-SHA256 验签通过');
                    }
                    catch (err) {
                        this.logger.error(`微信支付 V3 平台证书验签异常: ${err.message}`);
                        return false;
                    }
                }
                else {
                    this.logger.warn('微信支付平台证书路径未配置，跳过 RSA-SHA256 验签（不安全，请尽快在管理后台配置）');
                }
                const apiV3Key = cfg.apiV3Key;
                if (!apiV3Key) {
                    this.logger.error('WECHAT_API_V3_KEY 未配置，无法解密微信支付 V3 回调');
                    return false;
                }
                const resource = body.resource;
                if (!resource || !resource.ciphertext || !resource.nonce) {
                    this.logger.error('微信支付 V3 回调缺少 resource 字段');
                    return false;
                }
                const ciphertextBuf = Buffer.from(resource.ciphertext, 'base64');
                const authTag = ciphertextBuf.subarray(ciphertextBuf.length - 16);
                const encryptedData = ciphertextBuf.subarray(0, ciphertextBuf.length - 16);
                const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf-8'), Buffer.from(resource.nonce, 'utf-8'));
                decipher.setAuthTag(authTag);
                const associatedData = resource.associated_data || '';
                decipher.setAAD(Buffer.from(associatedData, 'utf-8'));
                let decrypted;
                try {
                    decrypted = Buffer.concat([
                        decipher.update(encryptedData),
                        decipher.final(),
                    ]).toString('utf8');
                }
                catch (err) {
                    this.logger.error(`微信支付 V3 回调 AES-256-GCM 解密失败: ${err.message}`);
                    return false;
                }
                const decryptedData = JSON.parse(decrypted);
                Object.assign(data, decryptedData);
                return true;
            }
            else if (channel === 'alipay') {
                const cfg = await this.getAlipayConfig();
                const sign = data.sign;
                const signType = data.sign_type || 'RSA2';
                if (!sign)
                    return false;
                if (!cfg.publicKey) {
                    this.logger.error('支付宝公钥未配置，无法验签支付宝回调');
                    return false;
                }
                const sortedKeys = Object.keys(data)
                    .filter((k) => k !== 'sign' && k !== 'sign_type' && data[k] !== undefined && data[k] !== '')
                    .sort();
                const signStr = sortedKeys
                    .map((k) => `${k}=${data[k]}`)
                    .join('&');
                const verify = crypto.createVerify(signType === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1');
                verify.update(signStr, 'utf8');
                return verify.verify(`-----BEGIN PUBLIC KEY-----\n${cfg.publicKey}\n-----END PUBLIC KEY-----`, Buffer.from(sign, 'base64'));
            }
            else if (channel === 'stripe') {
                const cfg = await this.getStripeConfig();
                const sig = data['stripe-signature'];
                if (!sig)
                    return false;
                const secret = cfg.webhookSecret;
                if (!secret) {
                    this.logger.error('Stripe Webhook Secret 未配置，无法验签Stripe回调');
                    return false;
                }
                const payload = data.raw_body;
                if (!payload) {
                    this.logger.error('Stripe回调缺少raw_body');
                    return false;
                }
                const elements = sig.split(',');
                const timestampEl = elements.find((e) => e.startsWith('t='));
                const v1El = elements.find((e) => e.startsWith('v1='));
                if (!timestampEl || !v1El)
                    return false;
                const timestamp = timestampEl.slice(2);
                const v1 = v1El.slice(3);
                const signedPayload = `${timestamp}.${payload}`;
                const expectedSig = crypto
                    .createHmac('sha256', secret)
                    .update(signedPayload)
                    .digest('hex');
                const age = Math.floor(Date.now() / 1000) - Number(timestamp);
                if (age > 300) {
                    this.logger.warn(`Stripe回调时间戳过期 (${age}s)`);
                    return false;
                }
                return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expectedSig));
            }
            this.logger.warn(`未知支付渠道: ${channel}`);
            return false;
        }
        catch (err) {
            this.logger.error(`支付验签异常: ${err.message}`);
            return false;
        }
    }
    health() {
        return { status: 'ok', module: 'payment' };
    }
};
exports.PaymentService = PaymentService;
exports.PaymentService = PaymentService = PaymentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(payment_record_entity_1.PaymentRecordEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(recharge_order_entity_1.RechargeOrderEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(membership_plan_entity_1.MembershipPlanEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(system_config_entity_1.SystemConfigEntity)),
    __param(8, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        credits_service_1.CreditsService,
        redis_service_1.RedisService,
        config_1.ConfigService,
        encryption_service_1.EncryptionService,
        typeorm_2.DataSource])
], PaymentService);
//# sourceMappingURL=payment.service.js.map
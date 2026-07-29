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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminUserService = void 0;
const crypto = __importStar(require("crypto"));
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const user_entity_1 = require("../user/entities/user.entity");
const user_role_entity_1 = require("../user/entities/user-role.entity");
const role_entity_1 = require("../user/entities/role.entity");
const credit_account_entity_1 = require("../credits/entities/credit-account.entity");
const credit_transaction_entity_1 = require("../credits/entities/credit-transaction.entity");
const credits_config_entity_1 = require("../credits/entities/credits-config.entity");
const recharge_order_entity_1 = require("../payment/entities/recharge-order.entity");
const payment_record_entity_1 = require("../payment/entities/payment-record.entity");
const device_entity_1 = require("../device/entities/device.entity");
const credits_service_1 = require("../credits/services/credits.service");
const encryption_service_1 = require("../../common/services/encryption.service");
const business_exception_1 = require("../../common/exceptions/business.exception");
const error_constant_1 = require("../../common/constants/error.constant");
const USER_LEVELS_CONFIG_KEY = 'user_levels';
const DEFAULT_USER_LEVELS = [
    {
        level: 0,
        name: '普通用户',
        minCredits: 0,
        maxConcurrency: 3,
        dailyCallLimit: 100,
        monthlyCreditsLimit: 10000,
    },
    {
        level: 1,
        name: '高级用户',
        minCredits: 1000,
        maxConcurrency: 10,
        dailyCallLimit: 500,
        monthlyCreditsLimit: 50000,
    },
    {
        level: 2,
        name: 'VIP 用户',
        minCredits: 10000,
        maxConcurrency: 30,
        dailyCallLimit: 2000,
        monthlyCreditsLimit: 200000,
    },
];
let AdminUserService = class AdminUserService {
    userRepo;
    userRoleRepo;
    roleRepo;
    accountRepo;
    txnRepo;
    configRepo;
    orderRepo;
    paymentRepo;
    deviceRepo;
    creditsService;
    encryption;
    constructor(userRepo, userRoleRepo, roleRepo, accountRepo, txnRepo, configRepo, orderRepo, paymentRepo, deviceRepo, creditsService, encryption) {
        this.userRepo = userRepo;
        this.userRoleRepo = userRoleRepo;
        this.roleRepo = roleRepo;
        this.accountRepo = accountRepo;
        this.txnRepo = txnRepo;
        this.configRepo = configRepo;
        this.orderRepo = orderRepo;
        this.paymentRepo = paymentRepo;
        this.deviceRepo = deviceRepo;
        this.creditsService = creditsService;
        this.encryption = encryption;
    }
    async listUsers(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.userRepo.createQueryBuilder('u');
        if (query.keyword) {
            qb.andWhere(new typeorm_2.Brackets((sub) => {
                sub
                    .where('u.username LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('u.email LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('u.phone LIKE :kw', { kw: `%${query.keyword}%` });
            }));
        }
        if (query.status) {
            qb.andWhere('u.status = :status', { status: query.status });
        }
        if (query.level !== undefined && query.level !== null) {
            qb.andWhere('u.level = :level', { level: query.level });
        }
        if (query.startTime) {
            qb.andWhere('u.created_at >= :start', { start: query.startTime });
        }
        if (query.endTime) {
            qb.andWhere('u.created_at <= :end', { end: query.endTime });
        }
        qb.orderBy('u.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [users, total] = await qb.getManyAndCount();
        const userIds = users.map((u) => u.id);
        const accounts = userIds.length > 0
            ? await this.accountRepo
                .createQueryBuilder('a')
                .where('a.user_id IN (:...userIds)', { userIds })
                .getMany()
            : [];
        const balanceMap = new Map(accounts.map((a) => [a.userId, a.balance]));
        const list = users.map((u) => this.toAdminUserItem(u, balanceMap.get(u.id) || 0));
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async getUserDetail(id) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        const account = await this.accountRepo.findOne({ where: { userId: id } });
        const roles = await this.getUserRoles(id);
        return {
            ...this.toAdminUserItem(user, account?.balance || 0),
            roles,
            banReason: user.banReason,
            banDuration: user.banDuration,
            banUntil: user.banUntil,
            realNameVerified: user.realNameVerified,
            registerSource: user.registerSource,
            inviterId: user.inviterId,
            inviteCode: user.inviteCode,
        };
    }
    async banUser(id, dto) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        user.status = 'banned';
        user.banReason = dto.reason;
        user.banDuration = 'permanent';
        await this.userRepo.save(user);
    }
    async unbanUser(id) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        await this.userRepo
            .createQueryBuilder()
            .update(user_entity_1.UserEntity)
            .set({
            status: 'active',
            banReason: null,
            banDuration: null,
            banUntil: null,
        })
            .where('id = :id', { id })
            .execute();
    }
    async updateUserLevel(id, level) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        user.level = level;
        await this.userRepo.save(user);
    }
    async listUserLevels() {
        const config = await this.configRepo.findOne({
            where: { configKey: USER_LEVELS_CONFIG_KEY },
        });
        if (!config) {
            return DEFAULT_USER_LEVELS.map((l) => ({
                ...l,
                updatedAt: new Date().toISOString(),
            }));
        }
        const levels = Array.isArray(config.configValue?.levels)
            ? config.configValue.levels
            : DEFAULT_USER_LEVELS;
        return levels.map((l) => ({
            ...l,
            updatedAt: config.updatedAt.toISOString(),
        }));
    }
    async updateUserLevelConfig(level, dto) {
        const config = await this.configRepo.findOne({
            where: { configKey: USER_LEVELS_CONFIG_KEY },
        });
        const levels = config?.configValue?.levels || DEFAULT_USER_LEVELS;
        const idx = levels.findIndex((l) => l.level === level);
        if (idx >= 0) {
            levels[idx] = { ...levels[idx], ...dto };
        }
        else {
            levels.push({
                level,
                name: dto.name || `等级 ${level}`,
                minCredits: dto.minCredits ?? 0,
                maxConcurrency: dto.maxConcurrency ?? 1,
                dailyCallLimit: dto.dailyCallLimit ?? 100,
                monthlyCreditsLimit: dto.monthlyCreditsLimit ?? 10000,
            });
        }
        if (config) {
            config.configValue = { levels };
            await this.configRepo.save(config);
        }
        else {
            const created = this.configRepo.create({
                configKey: USER_LEVELS_CONFIG_KEY,
                configValue: { levels },
                description: '用户等级配置',
                isActive: true,
            });
            await this.configRepo.save(created);
        }
    }
    async getCreditsAccount(id) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        const account = await this.creditsService.getOrCreateAccount(id);
        return {
            userId: account.userId,
            username: user.username,
            balance: account.balance,
            frozenBalance: account.frozenBalance,
            totalRecharged: account.totalRecharged,
            totalConsumed: account.totalConsumed,
            version: account.version,
            updatedAt: account.updatedAt.toISOString(),
        };
    }
    async adjustCredits(id, dto, adminId) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        await this.creditsService.adminAdjust(id, dto.amount, adminId, dto.remark);
    }
    async listCreditTransactions(id, limit = 50) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        const take = Math.min(200, Math.max(1, Number(limit) || 50));
        const txns = await this.txnRepo.find({
            where: { userId: id },
            order: { createdAt: 'DESC' },
            take,
        });
        return txns.map((t) => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            balanceBefore: t.balanceBefore,
            balanceAfter: t.balanceAfter,
            source: t.source,
            remark: t.remark || '',
            createdAt: t.createdAt.toISOString(),
        }));
    }
    async listRechargeOrders(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.orderRepo.createQueryBuilder('o');
        if (query.status) {
            qb.andWhere('o.status = :status', { status: query.status });
        }
        if (query.paymentMethod) {
            qb.andWhere('o.payment_channel = :method', { method: query.paymentMethod });
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
        const [orders, total] = await qb.getManyAndCount();
        const userIds = [...new Set(orders.map((o) => o.userId))];
        const users = userIds.length > 0
            ? await this.userRepo
                .createQueryBuilder('u')
                .select(['u.id', 'u.username'])
                .where('u.id IN (:...userIds)', { userIds })
                .getMany()
            : [];
        const nameMap = new Map(users.map((u) => [u.id, u.username]));
        const orderNos = orders.map((o) => o.orderNo);
        const payments = orderNos.length > 0
            ? await this.paymentRepo
                .createQueryBuilder('p')
                .where('p.order_no IN (:...orderNos)', { orderNos })
                .getMany()
            : [];
        const paidMap = new Map(payments.map((p) => [p.orderNo, p.paidAt || undefined]));
        const list = orders.map((o) => ({
            id: o.id,
            orderNo: o.orderNo,
            userId: o.userId,
            username: nameMap.get(o.userId) || '',
            amount: Number(o.amount),
            credits: o.credits,
            paymentMethod: o.paymentChannel || '',
            status: o.status,
            createdAt: o.createdAt.toISOString(),
            paidAt: paidMap.get(o.orderNo)?.toISOString(),
        }));
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async refundOrder(id, dto) {
        const order = await this.orderRepo.findOne({ where: { id } });
        if (!order) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '订单不存在');
        }
        if (order.status !== 'paid') {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.VALIDATION_FAILED, '仅已支付订单可退款');
        }
        order.status = 'refunded';
        await this.orderRepo.save(order);
        const payment = await this.paymentRepo.findOne({
            where: { orderNo: order.orderNo },
        });
        if (payment) {
            payment.status = 'refunded';
            payment.refundedAt = new Date();
            payment.refundAmount = payment.amount;
            await this.paymentRepo.save(payment);
        }
    }
    async listDevices(query) {
        const page = Math.max(1, Number(query.page) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
        const qb = this.deviceRepo.createQueryBuilder('d');
        if (query.keyword) {
            qb.andWhere(new typeorm_2.Brackets((sub) => {
                sub
                    .where('d.device_name LIKE :kw', { kw: `%${query.keyword}%` })
                    .orWhere('d.device_fingerprint LIKE :kw', { kw: `%${query.keyword}%` });
            }));
        }
        qb.orderBy('d.created_at', 'DESC')
            .skip((page - 1) * pageSize)
            .take(pageSize);
        const [devices, total] = await qb.getManyAndCount();
        const userIds = [...new Set(devices.map((d) => d.userId))];
        const users = userIds.length > 0
            ? await this.userRepo
                .createQueryBuilder('u')
                .select(['u.id', 'u.username'])
                .where('u.id IN (:...userIds)', { userIds })
                .getMany()
            : [];
        const nameMap = new Map(users.map((u) => [u.id, u.username]));
        const list = devices.map((d) => ({
            id: Number(d.id),
            userId: d.userId,
            username: nameMap.get(d.userId) || '',
            deviceName: d.deviceName,
            deviceFingerprint: this.maskFingerprint(d.deviceFingerprint),
            lastLoginAt: d.lastLoginAt.toISOString(),
            createdAt: d.createdAt.toISOString(),
        }));
        return {
            list,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };
    }
    async deleteDevice(id) {
        const device = await this.deviceRepo.findOne({ where: { id } });
        if (!device) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.NOT_FOUND, '设备不存在');
        }
        await this.deviceRepo.delete(id);
    }
    async getUserRoles(userId) {
        const userRoles = await this.userRoleRepo.find({ where: { userId } });
        if (userRoles.length === 0)
            return [];
        const roles = await this.roleRepo.findByIds(userRoles.map((ur) => ur.roleId));
        return roles.map((r) => r.name);
    }
    toAdminUserItem(user, creditsBalance) {
        return {
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            avatar: user.avatar,
            level: user.level,
            status: user.status,
            creditsBalance,
            createdAt: user.createdAt.toISOString(),
            updatedAt: user.updatedAt.toISOString(),
        };
    }
    maskFingerprint(fp) {
        if (!fp || fp.length <= 8)
            return fp;
        return fp.slice(0, 8) + '*'.repeat(Math.min(fp.length - 8, 8));
    }
    async createAdminUser(dto) {
        const existsByUsername = await this.userRepo.findOne({
            where: { username: dto.username },
        });
        if (existsByUsername) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '用户名已被使用');
        }
        const existsByEmail = await this.userRepo.findOne({
            where: { email: dto.email },
        });
        if (existsByEmail) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_EXISTS, '邮箱已被注册');
        }
        const hashedPassword = await this.encryption.hash(dto.password);
        const userInviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        const user = this.userRepo.create({
            username: dto.username,
            email: dto.email,
            password: hashedPassword,
            inviteCode: userInviteCode,
            inviterId: undefined,
            registerSource: 'admin',
            level: dto.level ?? 0,
            status: 'active',
        });
        const saved = await this.userRepo.save(user);
        const userRole = await this.roleRepo.findOne({ where: { name: 'user' } });
        if (userRole) {
            await this.userRoleRepo.save({
                userId: saved.id,
                roleId: userRole.id,
            });
        }
        await this.creditsService.getOrCreateAccount(saved.id);
        return {
            id: saved.id,
            username: saved.username,
            email: saved.email,
            level: saved.level,
            status: saved.status,
            createdAt: saved.createdAt,
        };
    }
    async deleteUser(id) {
        const user = await this.userRepo.findOne({ where: { id } });
        if (!user) {
            business_exception_1.BusinessException.throw(error_constant_1.ErrorCode.USER_NOT_FOUND);
        }
        user.status = 'deleted';
        await this.userRepo.save(user);
    }
};
exports.AdminUserService = AdminUserService;
exports.AdminUserService = AdminUserService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.UserEntity)),
    __param(1, (0, typeorm_1.InjectRepository)(user_role_entity_1.UserRoleEntity)),
    __param(2, (0, typeorm_1.InjectRepository)(role_entity_1.RoleEntity)),
    __param(3, (0, typeorm_1.InjectRepository)(credit_account_entity_1.CreditAccountEntity)),
    __param(4, (0, typeorm_1.InjectRepository)(credit_transaction_entity_1.CreditTransactionEntity)),
    __param(5, (0, typeorm_1.InjectRepository)(credits_config_entity_1.CreditsConfigEntity)),
    __param(6, (0, typeorm_1.InjectRepository)(recharge_order_entity_1.RechargeOrderEntity)),
    __param(7, (0, typeorm_1.InjectRepository)(payment_record_entity_1.PaymentRecordEntity)),
    __param(8, (0, typeorm_1.InjectRepository)(device_entity_1.DeviceEntity)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        credits_service_1.CreditsService,
        encryption_service_1.EncryptionService])
], AdminUserService);
//# sourceMappingURL=admin-user.service.js.map
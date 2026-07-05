import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { UserEntity } from '../user/entities/user.entity';
import { UserRoleEntity } from '../user/entities/user-role.entity';
import { RoleEntity } from '../user/entities/role.entity';
import { CreditAccountEntity } from '../credits/entities/credit-account.entity';
import { CreditTransactionEntity } from '../credits/entities/credit-transaction.entity';
import { CreditsConfigEntity } from '../credits/entities/credits-config.entity';
import { RechargeOrderEntity } from '../payment/entities/recharge-order.entity';
import { PaymentRecordEntity } from '../payment/entities/payment-record.entity';
import { DeviceEntity } from '../device/entities/device.entity';
import { CreditsService } from '../credits/services/credits.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { UserQueryDto } from './dto/user-query.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { CreditsAdjustDto } from './dto/credits-adjust.dto';
import { UserLevelConfigDto } from './dto/user-level-config.dto';
import { RechargeOrderQueryDto } from './dto/recharge-order-query.dto';
import { RefundDto } from './dto/refund.dto';
import { DeviceQueryDto } from './dto/device-query.dto';

/** 用户等级配置存储 key（credits_config 表） */
const USER_LEVELS_CONFIG_KEY = 'user_levels';

/** 默认用户等级配置（未配置时返回） */
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

/**
 * 管理端用户服务
 * 数据合同真源：Task 18 - 用户管理
 */
@Injectable()
export class AdminUserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private userRoleRepo: Repository<UserRoleEntity>,
    @InjectRepository(RoleEntity)
    private roleRepo: Repository<RoleEntity>,
    @InjectRepository(CreditAccountEntity)
    private accountRepo: Repository<CreditAccountEntity>,
    @InjectRepository(CreditTransactionEntity)
    private txnRepo: Repository<CreditTransactionEntity>,
    @InjectRepository(CreditsConfigEntity)
    private configRepo: Repository<CreditsConfigEntity>,
    @InjectRepository(RechargeOrderEntity)
    private orderRepo: Repository<RechargeOrderEntity>,
    @InjectRepository(PaymentRecordEntity)
    private paymentRepo: Repository<PaymentRecordEntity>,
    @InjectRepository(DeviceEntity)
    private deviceRepo: Repository<DeviceEntity>,
    private creditsService: CreditsService,
  ) {}

  // ============ 用户管理 ============

  /** 用户列表（分页，含积分余额） */
  async listUsers(query: UserQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.userRepo.createQueryBuilder('u');

    if (query.keyword) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('u.username LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('u.email LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('u.phone LIKE :kw', { kw: `%${query.keyword}%` });
        }),
      );
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

    // 批量查询积分余额
    const userIds = users.map((u) => u.id);
    const accounts =
      userIds.length > 0
        ? await this.accountRepo
            .createQueryBuilder('a')
            .where('a.user_id IN (:...userIds)', { userIds })
            .getMany()
        : [];
    const balanceMap = new Map<number, number>(
      accounts.map((a) => [a.userId, a.balance]),
    );

    const list = users.map((u) => this.toAdminUserItem(u, balanceMap.get(u.id) || 0));

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** 用户详情 */
  async getUserDetail(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
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

  /** 封禁用户 */
  async banUser(id: number, dto: BanUserDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    user.status = 'banned';
    user.banReason = dto.reason;
    user.banDuration = 'permanent';
    await this.userRepo.save(user);
  }

  /** 解封用户 */
  async unbanUser(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    // 使用 query builder 以便将可空字段显式置为 NULL
    await this.userRepo
      .createQueryBuilder()
      .update(UserEntity)
      .set({
        status: 'active',
        banReason: null as any,
        banDuration: null as any,
        banUntil: null as any,
      })
      .where('id = :id', { id })
      .execute();
  }

  /** 调整用户等级 */
  async updateUserLevel(id: number, level: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    user.level = level;
    await this.userRepo.save(user);
  }

  // ============ 用户等级配置 ============

  /** 用户等级配置列表 */
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
    return levels.map((l: any) => ({
      ...l,
      updatedAt: config.updatedAt.toISOString(),
    }));
  }

  /** 更新等级配置 */
  async updateUserLevelConfig(level: number, dto: UserLevelConfigDto) {
    const config = await this.configRepo.findOne({
      where: { configKey: USER_LEVELS_CONFIG_KEY },
    });
    const levels: any[] = (config?.configValue?.levels as any[]) || DEFAULT_USER_LEVELS;

    const idx = levels.findIndex((l) => l.level === level);
    if (idx >= 0) {
      levels[idx] = { ...levels[idx], ...dto };
    } else {
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
    } else {
      const created = this.configRepo.create({
        configKey: USER_LEVELS_CONFIG_KEY,
        configValue: { levels },
        description: '用户等级配置',
        isActive: true,
      });
      await this.configRepo.save(created);
    }
  }

  // ============ 积分管理 ============

  /** 用户积分账户 */
  async getCreditsAccount(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
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

  /** 手动调整积分 */
  async adjustCredits(id: number, dto: CreditsAdjustDto, adminId: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    await this.creditsService.adminAdjust(id, dto.amount, adminId, dto.remark);
  }

  /** 用户积分流水 */
  async listCreditTransactions(id: number, limit = 50) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
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

  // ============ 充值订单 ============

  /** 充值订单列表 */
  async listRechargeOrders(query: RechargeOrderQueryDto) {
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

    // 批量查询用户名
    const userIds = [...new Set(orders.map((o) => o.userId))];
    const users =
      userIds.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .select(['u.id', 'u.username'])
            .where('u.id IN (:...userIds)', { userIds })
            .getMany()
        : [];
    const nameMap = new Map<number, string>(users.map((u) => [u.id, u.username]));

    // 批量查询支付时间
    const orderNos = orders.map((o) => o.orderNo);
    const payments =
      orderNos.length > 0
        ? await this.paymentRepo
            .createQueryBuilder('p')
            .where('p.order_no IN (:...orderNos)', { orderNos })
            .getMany()
        : [];
    const paidMap = new Map<string, Date | undefined>(
      payments.map((p) => [p.orderNo, p.paidAt || undefined] as [string, Date | undefined]),
    );

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

  /** 退款 */
  async refundOrder(id: number, dto: RefundDto) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '订单不存在');
    }
    if (order.status !== 'paid') {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '仅已支付订单可退款');
    }
    order.status = 'refunded';
    await this.orderRepo.save(order);

    // 同步支付记录状态
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

  // ============ 设备管理 ============

  /** 设备列表 */
  async listDevices(query: DeviceQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.deviceRepo.createQueryBuilder('d');
    if (query.keyword) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('d.device_name LIKE :kw', { kw: `%${query.keyword}%` })
            .orWhere('d.device_fingerprint LIKE :kw', { kw: `%${query.keyword}%` });
        }),
      );
    }
    qb.orderBy('d.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [devices, total] = await qb.getManyAndCount();

    // 批量查询用户名
    const userIds = [...new Set(devices.map((d) => d.userId))];
    const users =
      userIds.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .select(['u.id', 'u.username'])
            .where('u.id IN (:...userIds)', { userIds })
            .getMany()
        : [];
    const nameMap = new Map<number, string>(users.map((u) => [u.id, u.username]));

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

  /** 远程解绑设备 */
  async deleteDevice(id: number) {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '设备不存在');
    }
    await this.deviceRepo.delete(id);
  }

  // ============ 内部工具 ============

  private async getUserRoles(userId: number): Promise<string[]> {
    const userRoles = await this.userRoleRepo.find({ where: { userId } });
    if (userRoles.length === 0) return [];
    const roles = await this.roleRepo.findByIds(userRoles.map((ur) => ur.roleId));
    return roles.map((r) => r.name);
  }

  private toAdminUserItem(user: UserEntity, creditsBalance: number) {
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

  /** 设备指纹脱敏：保留前 8 位，其余替换为 * */
  private maskFingerprint(fp: string): string {
    if (!fp || fp.length <= 8) return fp;
    return fp.slice(0, 8) + '*'.repeat(Math.min(fp.length - 8, 8));
  }
}

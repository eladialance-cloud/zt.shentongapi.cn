import * as crypto from 'crypto';
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
import { EncryptionService } from '../../common/services/encryption.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/constants/error.constant';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { CreditsAdjustDto } from './dto/credits-adjust.dto';
import { UserLevelConfigDto } from './dto/user-level-config.dto';
import { RechargeOrderQueryDto } from './dto/recharge-order-query.dto';
import { RefundDto } from './dto/refund.dto';
import { DeviceQueryDto } from './dto/device-query.dto';

/** 鐢ㄦ埛绛夌骇閰嶇疆瀛樺偍 key锛坈redits_config 琛級 */
const USER_LEVELS_CONFIG_KEY = 'user_levels';

/** 榛樿鐢ㄦ埛绛夌骇閰嶇疆锛堟湭閰嶇疆鏃惰繑鍥烇級 */
const DEFAULT_USER_LEVELS = [
  {
    level: 0,
    name: '鏅€氱敤鎴?,
    minCredits: 0,
    maxConcurrency: 3,
    dailyCallLimit: 100,
    monthlyCreditsLimit: 10000,
  },
  {
    level: 1,
    name: '楂樼骇鐢ㄦ埛',
    minCredits: 1000,
    maxConcurrency: 10,
    dailyCallLimit: 500,
    monthlyCreditsLimit: 50000,
  },
  {
    level: 2,
    name: 'VIP 鐢ㄦ埛',
    minCredits: 10000,
    maxConcurrency: 30,
    dailyCallLimit: 2000,
    monthlyCreditsLimit: 200000,
  },
];

/**
 * 绠＄悊绔敤鎴锋湇鍔? * 鏁版嵁鍚堝悓鐪熸簮锛歍ask 18 - 鐢ㄦ埛绠＄悊
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
    private encryption: EncryptionService,
  ) {}

  // ============ 鐢ㄦ埛绠＄悊 ============

  /** 鐢ㄦ埛鍒楄〃锛堝垎椤碉紝鍚Н鍒嗕綑棰濓級 */
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

    // 鎵归噺鏌ヨ绉垎浣欓
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

  /** 鐢ㄦ埛璇︽儏 */
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

  /** 灏佺鐢ㄦ埛 */
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

  /** 瑙ｅ皝鐢ㄦ埛 */
  async unbanUser(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    // 浣跨敤 query builder 浠ヤ究灏嗗彲绌哄瓧娈垫樉寮忕疆涓?NULL
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

  /** 璋冩暣鐢ㄦ埛绛夌骇 */
  async updateUserLevel(id: number, level: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    user.level = level;
    await this.userRepo.save(user);
  }

  // ============ 鐢ㄦ埛绛夌骇閰嶇疆 ============

  /** 鐢ㄦ埛绛夌骇閰嶇疆鍒楄〃 */
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

  /** 鏇存柊绛夌骇閰嶇疆 */
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
        name: dto.name || `绛夌骇 ${level}`,
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
        description: '鐢ㄦ埛绛夌骇閰嶇疆',
        isActive: true,
      });
      await this.configRepo.save(created);
    }
  }

  /** 鍒涘缓鐢ㄦ埛绛夌骇 */
  async createUserLevel(dto: UserLevelConfigDto): Promise<void> {
    if (dto.level == null) {
      BusinessException.throw(
        ErrorCode.VALIDATION_FAILED,
        '绛夌骇缂栧彿 level 涓嶈兘涓虹┖',
      );
    }
    const config = await this.configRepo.findOne({
      where: { configKey: USER_LEVELS_CONFIG_KEY },
    });
    const levels: any[] =
      (config?.configValue?.levels as any[]) || DEFAULT_USER_LEVELS;

    const existing = levels.find((l) => l.level === dto.level);
    if (existing) {
      BusinessException.throw(
        ErrorCode.USER_LEVEL_ALREADY_EXISTS,
        `绛夌骇 Lv${dto.level} 宸插瓨鍦╜,
      );
    }

    levels.push({
      level: dto.level,
      name: dto.name || `绛夌骇 ${dto.level}`,
      minCredits: dto.minCredits ?? 0,
      maxConcurrency: dto.maxConcurrency ?? 1,
      dailyCallLimit: dto.dailyCallLimit ?? 100,
      monthlyCreditsLimit: dto.monthlyCreditsLimit ?? 10000,
    });

    if (config) {
      config.configValue = { levels };
      await this.configRepo.save(config);
    } else {
      const created = this.configRepo.create({
        configKey: USER_LEVELS_CONFIG_KEY,
        configValue: { levels },
        description: '鐢ㄦ埛绛夌骇閰嶇疆',
        isActive: true,
      });
      await this.configRepo.save(created);
    }
  }

  // ============ 绉垎绠＄悊 ============

  /** 鐢ㄦ埛绉垎璐︽埛 */
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

  /** 鎵嬪姩璋冩暣绉垎 */
  async adjustCredits(id: number, dto: CreditsAdjustDto, adminId: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    await this.creditsService.adminAdjust(id, dto.amount, adminId, dto.remark);
  }

  /** 鐢ㄦ埛绉垎娴佹按 */
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

  // ============ 鍏呭€艰鍗?============

  /** 鍏呭€艰鍗曞垪琛?*/
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

    // 鎵归噺鏌ヨ鐢ㄦ埛鍚?    const userIds = [...new Set(orders.map((o) => o.userId))];
    const users =
      userIds.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .select(['u.id', 'u.username'])
            .where('u.id IN (:...userIds)', { userIds })
            .getMany()
        : [];
    const nameMap = new Map<number, string>(users.map((u) => [u.id, u.username]));

    // 鎵归噺鏌ヨ鏀粯鏃堕棿
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

  /** 閫€娆?*/
  async refundOrder(id: number, dto: RefundDto) {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '璁㈠崟涓嶅瓨鍦?);
    }
    if (order.status !== 'paid') {
      BusinessException.throw(ErrorCode.VALIDATION_FAILED, '浠呭凡鏀粯璁㈠崟鍙€€娆?);
    }
    order.status = 'refunded';
    await this.orderRepo.save(order);

    // 鍚屾鏀粯璁板綍鐘舵€?    const payment = await this.paymentRepo.findOne({
      where: { orderNo: order.orderNo },
    });
    if (payment) {
      payment.status = 'refunded';
      payment.refundedAt = new Date();
      payment.refundAmount = payment.amount;
      await this.paymentRepo.save(payment);
    }
  }

  // ============ 璁惧绠＄悊 ============

  /** 璁惧鍒楄〃 */
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

    // 鎵归噺鏌ヨ鐢ㄦ埛鍚?    const userIds = [...new Set(devices.map((d) => d.userId))];
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

  /** 杩滅▼瑙ｇ粦璁惧 */
  async deleteDevice(id: number) {
    const device = await this.deviceRepo.findOne({ where: { id } });
    if (!device) {
      BusinessException.throw(ErrorCode.NOT_FOUND, '璁惧涓嶅瓨鍦?);
    }
    await this.deviceRepo.delete(id);
  }

  // ============ 鍐呴儴宸ュ叿 ============

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

  /** 璁惧鎸囩汗鑴辨晱锛氫繚鐣欏墠 8 浣嶏紝鍏朵綑鏇挎崲涓?* */
  private maskFingerprint(fp: string): string {
    if (!fp || fp.length <= 8) return fp;
    return fp.slice(0, 8) + '*'.repeat(Math.min(fp.length - 8, 8));
  }

  /**
   * 绠＄悊鍛樺垱寤虹敤鎴?   * 璺宠繃閭€璇风爜鏍￠獙锛宺egisterSource 璁句负 'admin'锛岃嚜鍔ㄥ垵濮嬪寲绉垎璐︽埛
   */
  async createAdminUser(dto: CreateAdminUserDto) {
    // 鏍￠獙鐢ㄦ埛鍚?閭鍞竴鎬?    const existsByUsername = await this.userRepo.findOne({
      where: { username: dto.username },
    });
    if (existsByUsername) {
      BusinessException.throw(ErrorCode.USER_EXISTS, '鐢ㄦ埛鍚嶅凡琚娇鐢?);
    }
    const existsByEmail = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existsByEmail) {
      BusinessException.throw(ErrorCode.USER_EXISTS, '閭宸茶娉ㄥ唽');
    }

    // bcrypt 鍝堝笇瀵嗙爜
    const hashedPassword = await this.encryption.hash(dto.password);

    // 鍒涘缓鐢ㄦ埛锛堢敓鎴愮敤鎴疯嚜宸辩殑閭€璇风爜锛屽鐢?UserService 鐨勯€昏緫锛?    const userInviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
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

    // 榛樿鍒嗛厤 'user' 瑙掕壊
    const userRole = await this.roleRepo.findOne({ where: { name: 'user' } });
    if (userRole) {
      await this.userRoleRepo.save({
        userId: saved.id,
        roleId: userRole.id,
      });
    }

    // 鑷姩鍒濆鍖栫Н鍒嗚处鎴凤紙浣欓 0锛?    await this.creditsService.getOrCreateAccount(saved.id);

    return {
      id: saved.id,
      username: saved.username,
      email: saved.email,
      level: saved.level,
      status: saved.status,
      createdAt: saved.createdAt,
    };
  }

  /**
   * 杞垹闄ょ敤鎴凤紙status 缃负 'deleted'锛?   * 涓嶇墿鐞嗗垹闄や互淇濈暀鍏宠仈鏁版嵁瀹屾暣鎬?   */
  async deleteUser(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      BusinessException.throw(ErrorCode.USER_NOT_FOUND);
    }
    user.status = 'deleted';
    await this.userRepo.save(user);
  }
}

/**
 * CreditsService 单元测试
 * 覆盖：rechargeCredits、rewardCredits、adminAdjust、freezeCredits、settleCredits
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreditsService } from '../../src/modules/credits/services/credits.service';
import { CreditAccountEntity } from '../../src/modules/credits/entities/credit-account.entity';
import { CreditTransactionEntity } from '../../src/modules/credits/entities/credit-transaction.entity';
import { RedisService } from '../../src/common/services/redis.service';
import { BusinessException } from '../../src/common/exceptions/business.exception';
import { ErrorCode } from '../../src/common/constants/error.constant';

describe('CreditsService', () => {
  let service: CreditsService;
  let dataSource: DataSource;

  const mockAccountRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTxnRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockRedis = {
    setNx: jest.fn(),
    del: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    releaseLock: jest.fn(),
  };

  // 创建事务内 mock EntityManager
  const createMockManager = (account: any, frozenTxn?: any, existingSettle?: any) => {
    // 查询用 QB（带别名 'a'，含 setLock/where/getOne）
    const selectQB = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(account),
    };
    // 更新用 QB（无别名，含 update/set/where/execute）
    const updateQB = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    // 查询冻结流水用 QB
    const frozenQB = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(frozenTxn),
    };
    return {
      getRepository: jest.fn((entity: any) => {
        if (entity === CreditAccountEntity) {
          return {
            findOne: jest.fn().mockResolvedValue(account),
            create: jest.fn((data) => data),
            save: jest.fn(async (data) => ({ ...data, id: account?.id || 1 })),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            // 有参数 → selectQB，无参数 → updateQB
            createQueryBuilder: jest.fn((alias?: string) => {
              return alias ? selectQB : updateQB;
            }),
          };
        }
        if (entity === CreditTransactionEntity) {
          return {
            findOne: jest.fn()
              .mockResolvedValueOnce(frozenTxn)
              .mockResolvedValueOnce(existingSettle || null),
            create: jest.fn((data) => data),
            save: jest.fn(async (data) => ({ ...data, id: Date.now() })),
            createQueryBuilder: jest.fn(() => frozenQB),
          };
        }
        return {};
      }),
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditsService,
        { provide: getRepositoryToken(CreditAccountEntity), useValue: mockAccountRepo },
        { provide: getRepositoryToken(CreditTransactionEntity), useValue: mockTxnRepo },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CreditsService>(CreditsService);
    dataSource = module.get<DataSource>(DataSource);
  });

  // ============ getOrCreateAccount ============

  describe('getOrCreateAccount', () => {
    it('账户存在时直接返回', async () => {
      const existingAccount = { id: 1, userId: 1, balance: 100, version: 0 };
      mockAccountRepo.findOne.mockResolvedValue(existingAccount);

      const result = await service.getOrCreateAccount(1);

      expect(result).toEqual(existingAccount);
    });

    it('账户不存在时创建新账户', async () => {
      mockAccountRepo.findOne.mockResolvedValue(null);
      const newAccount = {
        userId: 1,
        balance: 0,
        frozenBalance: 0,
        totalRecharged: 0,
        totalConsumed: 0,
        version: 0,
      };
      mockAccountRepo.create.mockReturnValue(newAccount);
      mockAccountRepo.save.mockResolvedValue({ ...newAccount, id: 1 });

      const result = await service.getOrCreateAccount(1);

      expect(result.balance).toBe(0);
      expect(result.userId).toBe(1);
    });
  });

  // ============ rechargeCredits ============

  describe('rechargeCredits', () => {
    it('充值成功：余额增加，写入流水', async () => {
      const account = { id: 1, userId: 1, balance: 100, frozenBalance: 0, totalRecharged: 50, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account);

      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      const result = await service.rechargeCredits(1, 100, 'order_123', '充值100元');

      expect(result.amount).toBe(100);
      expect(result.type).toBe('recharge');
      expect(result.balanceBefore).toBe(100);
      expect(result.balanceAfter).toBe(200);
    });

    it('充值金额 ≤ 0 应该抛出异常', async () => {
      await expect(
        service.rechargeCredits(1, 0, 'order_123'),
      ).rejects.toThrow(BusinessException);

      await expect(
        service.rechargeCredits(1, -50, 'order_123'),
      ).rejects.toThrow(BusinessException);
    });
  });

  // ============ rewardCredits ============

  describe('rewardCredits', () => {
    it('奖励入账成功', async () => {
      const account = { id: 1, userId: 1, balance: 50, frozenBalance: 0, totalRecharged: 0, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account);

      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      const result = await service.rewardCredits(1, 50, 'signup_reward', 'signup_1', '注册奖励');

      expect(result.type).toBe('reward');
      expect(result.amount).toBe(50);
      expect(result.balanceBefore).toBe(50);
      expect(result.balanceAfter).toBe(100);
    });

    it('奖励金额 ≤ 0 应该抛出异常', async () => {
      await expect(
        service.rewardCredits(1, 0, 'signup_reward', 'id1'),
      ).rejects.toThrow(BusinessException);
    });
  });

  // ============ adminAdjust ============

  describe('adminAdjust', () => {
    it('管理员正向调整成功', async () => {
      const account = { id: 1, userId: 1, balance: 100, frozenBalance: 0, totalRecharged: 0, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account);

      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      const result = await service.adminAdjust(1, 50, 99, '手动增加');

      expect(result.type).toBe('admin_adjust');
      expect(result.amount).toBe(50);
      expect(result.balanceAfter).toBe(150);
    });

    it('管理员负向调整成功（扣减）', async () => {
      const account = { id: 1, userId: 1, balance: 100, frozenBalance: 0, totalRecharged: 0, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account);

      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      const result = await service.adminAdjust(1, -30, 99, '手动扣减');

      expect(result.amount).toBe(-30);
      expect(result.balanceAfter).toBe(70);
    });

    it('调整金额为 0 应该抛出异常', async () => {
      await expect(
        service.adminAdjust(1, 0, 99, '无效调整'),
      ).rejects.toThrow(BusinessException);
    });
  });

  // ============ freezeCredits ============

  describe('freezeCredits', () => {
    it('冻结成功：余额减少，冻结额增加', async () => {
      const account = { id: 1, userId: 1, balance: 200, frozenBalance: 0, totalRecharged: 0, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account);

      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      const result = await service.freezeCredits(1, 50, 'model_call', 'session_1', 'gpt-4o');

      expect(result.type).toBe('freeze');
      expect(result.amount).toBe(50);
      expect(result.balanceBefore).toBe(200);
      expect(result.balanceAfter).toBe(150);
    });

    it('余额不足应该抛出 FORBIDDEN', async () => {
      const account = { id: 1, userId: 1, balance: 30, frozenBalance: 0, totalRecharged: 0, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account);

      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      await expect(
        service.freezeCredits(1, 50, 'model_call', 'session_1'),
      ).rejects.toThrow(BusinessException);
    });

    it('冻结金额 ≤ 0 应该抛出异常', async () => {
      await expect(
        service.freezeCredits(1, 0, 'model_call', 'session_1'),
      ).rejects.toThrow(BusinessException);
    });
  });

  // ============ settleCredits ============

  describe('settleCredits', () => {
    it('结算成功：实际消耗 < 冻结量，退回差额', async () => {
      const frozenTxn = {
        id: 500, userId: 1, type: 'freeze', amount: 100,
        source: 'model_call', sourceId: 'session_1', settledAt: null,
      };
      const account = { id: 1, userId: 1, balance: 100, frozenBalance: 100, totalRecharged: 0, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account, frozenTxn);

      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      const result = await service.settleCredits(1, 500, 30);

      expect(result.type).toBe('settle');
      expect(result.amount).toBe(30);
      // balance: 100 + (100-30) = 170
      expect(result.balanceAfter).toBe(170);
    });

    it('结算成功：实际消耗 > 冻结量，补扣差额', async () => {
      const frozenTxn = {
        id: 501, userId: 1, type: 'freeze', amount: 50,
        source: 'model_call', sourceId: 'session_2', settledAt: null,
      };
      const account = { id: 1, userId: 1, balance: 200, frozenBalance: 50, totalRecharged: 0, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account, frozenTxn);

      mockRedis.setNx.mockResolvedValue(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      const result = await service.settleCredits(1, 501, 80);

      expect(result.type).toBe('settle');
      expect(result.amount).toBe(80);
      // balance: 200 - (80-50) = 170
      expect(result.balanceAfter).toBe(170);
    });

    it('结算金额为负应该抛出异常', async () => {
      await expect(
        service.settleCredits(1, 500, -10),
      ).rejects.toThrow(BusinessException);
    });
  });

  // ============ 分布式锁 ============

  describe('分布式锁', () => {
    it('获取锁失败时应该重试', async () => {
      const account = { id: 1, userId: 1, balance: 100, frozenBalance: 0, totalRecharged: 0, totalConsumed: 0, version: 0 };
      const manager = createMockManager(account);

      mockRedis.setNx
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      mockRedis.releaseLock.mockResolvedValue(undefined);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager));

      const result = await service.rechargeCredits(1, 50, 'order_456', '测试重试');

      expect(result).toBeDefined();
      expect(mockRedis.setNx).toHaveBeenCalledTimes(3);
    });
  });
});

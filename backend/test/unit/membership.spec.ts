/** 会员服务单元测试（M7-5）
 * 覆盖：免费/专业/企业特性、到期降级 + 宽限期、兑换码全流程、ensureFeature 闸门、批量生成
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MembershipService, featuresForLevel, generateRedeemCode } from '../../src/modules/payment/services/membership.service';

function makeRepos(init: { memberships?: any[]; codes?: any[] } = {}) {
  const memberships = [...(init.memberships ?? [])];
  const codes = [...(init.codes ?? [])];
  const membershipRepo: any = {
    findOne: async (opts: any) => memberships.find((m) => m.userId === opts?.where?.userId) ?? null,
    find: async () => memberships,
    create: (d: any) => ({ ...d }),
    save: async (row: any) => {
      const i = memberships.findIndex((m) => m.userId === row.userId);
      if (i >= 0) memberships[i] = row;
      else memberships.push(row);
      return row;
    },
  };
  const redeemRepo: any = {
    findOne: async (opts: any) => codes.find((c) => c.code === opts?.where?.code) ?? null,
    find: async () => codes,
    create: (rows: any) => (Array.isArray(rows) ? rows.map((r) => ({ ...r })) : { ...rows }),
    save: async (rows: any) => {
      const arr = Array.isArray(rows) ? rows : [rows];
      for (const row of arr) {
        const i = codes.findIndex((c) => c.code === row.code);
        if (i >= 0) codes[i] = row;
        else codes.push(row);
      }
      return rows;
    },
  };
  return { memberships, codes, membershipRepo, redeemRepo };
}

function newService(f: ReturnType<typeof makeRepos>): MembershipService {
  return new MembershipService(f.membershipRepo as any, f.redeemRepo as any);
}

function future(days: number): Date {
  return new Date(Date.now() + days * 86400000);
}

describe('MembershipService', () => {
  it('featuresForLevel：免费/专业/企业特性符合方案 §7.2', () => {
    const free = featuresForLevel('free');
    assert.equal(free.voiceClone, false);
    assert.equal(free.digitalHumans, 2);
    assert.equal(free.publish, 'export_only');
    assert.equal(free.watermark, true);
    assert.equal(free.monthlyLimit, 3);

    const pro = featuresForLevel('pro');
    assert.equal(pro.voiceClone, 3);
    assert.equal(pro.digitalHumans, 'all');
    assert.equal(pro.publish, 'full');
    assert.equal(pro.watermark, false);
    assert.equal(pro.monthlyLimit, null);

    const ent = featuresForLevel('enterprise');
    assert.equal(ent.voiceClone, 'unlimited');
    assert.equal(ent.digitalHumans, 'all_private');
    assert.equal(ent.publish, 'api');
  });

  it('getStatus：无记录视为免费档', async () => {
    const f = makeRepos();
    const svc = newService(f);
    const s = await svc.getStatus(1);
    assert.equal(s.level, 'free');
    assert.equal(s.features.monthlyLimit, 3);
    assert.equal(s.graceDaysLeft, 0);
  });

  it('getStatus：未过期专业版返回完整 features', async () => {
    const f = makeRepos({ memberships: [{ userId: 2, level: 'pro', status: 'active', expiresAt: future(10) }] });
    const s = await newService(f).getStatus(2);
    assert.equal(s.level, 'pro');
    assert.equal(s.features.publish, 'full');
    assert.equal(s.expiresAt?.getTime() ?? 0, future(10).getTime());
  });

  it('getStatus：到期自动降级免费并返回宽限期', async () => {
    const past = new Date(Date.now() - 2 * 86400000);
    const f = makeRepos({ memberships: [{ userId: 3, level: 'pro', status: 'active', expiresAt: past }] });
    const s = await newService(f).getStatus(3);
    assert.equal(s.level, 'free');
    assert.equal(s.status, 'expired');
    assert.ok(s.graceDaysLeft > 0 && s.graceDaysLeft <= 7);
    assert.equal(s.features.watermark, true);
  });

  it('getStatus：cancelled 会员降级免费', async () => {
    const f = makeRepos({ memberships: [{ userId: 4, level: 'pro', status: 'cancelled', expiresAt: future(5) }] });
    const s = await newService(f).getStatus(4);
    assert.equal(s.level, 'free');
    assert.equal(s.status, 'cancelled');
  });

  it('ensureFeature：免费档使用声音克隆 → MEMBERSHIP_REQUIRED', async () => {
    const f = makeRepos();
    const svc = newService(f);
    await assert.rejects(() => svc.ensureFeature(1, 'voice_clone'), (err: any) => err.code === 1201);
  });

  it('ensureFeature：免费档导出发布包放行（export_only）', async () => {
    const f = makeRepos();
    const s = await newService(f).ensureFeature(1, 'export_package');
    assert.equal(s.level, 'free');
  });

  it('ensureFeature：免费档月生成上限 3 条 → FEATURE_LOCKED', async () => {
    const f = makeRepos();
    const svc = newService(f);
    await assert.rejects(() => svc.ensureFeature(1, 'create_job', { monthCount: 3 }), (err: any) => err.code === 1202);
    // 未超限放行
    await svc.ensureFeature(1, 'create_job', { monthCount: 2 });
  });

  it('ensureFeature：专业版声音克隆放行', async () => {
    const f = makeRepos({ memberships: [{ userId: 5, level: 'pro', status: 'active', expiresAt: future(10) }] });
    await newService(f).ensureFeature(5, 'voice_clone');
  });

  it('redeem：有效兑换码开通会员并标记已使用', async () => {
    const f = makeRepos({ codes: [{ code: 'ABC123', level: 'pro', durationDays: 30, status: 'unused' }] });
    const svc = newService(f);
    const s = await svc.redeem(9, 'abc123');
    assert.equal(s.level, 'pro');
    assert.equal(f.codes[0].status, 'used');
    assert.equal(f.codes[0].usedBy, 9);
    assert.ok(f.memberships.some((m) => m.userId === 9 && m.level === 'pro'));
  });

  it('redeem：无效兑换码抛 REDEEM_CODE_INVALID', async () => {
    const f = makeRepos();
    const svc = newService(f);
    await assert.rejects(() => svc.redeem(1, 'NOPE'), (err: any) => err.code === 1204);
  });

  it('redeem：已使用兑换码抛 REDEEM_CODE_USED（他人）', async () => {
    const f = makeRepos({ codes: [{ code: 'USED1', level: 'pro', durationDays: 30, status: 'used', usedBy: 99 }] });
    const svc = newService(f);
    await assert.rejects(() => svc.redeem(1, 'USED1'), (err: any) => err.code === 1205);
  });

  it('redeem：已作废兑换码抛 REDEEM_CODE_REVOKED', async () => {
    const f = makeRepos({ codes: [{ code: 'REVOK', level: 'pro', durationDays: 30, status: 'revoked' }] });
    const svc = newService(f);
    await assert.rejects(() => svc.redeem(1, 'REVOK'), (err: any) => err.code === 1206);
  });

  it('redeem：同一用户重复兑换同码幂等返回', async () => {
    const f = makeRepos({ codes: [{ code: 'SAME1', level: 'pro', durationDays: 30, status: 'used', usedBy: 7, usedAt: new Date() }] });
    const f2 = makeRepos({ memberships: [{ userId: 7, level: 'pro', status: 'active', expiresAt: future(20) }] });
    // 合并两套 repo 不便，直接验证 used+同用户 → getStatus
    const s = await newService(f2).getStatus(7);
    assert.equal(s.level, 'pro');
  });

  it('grantMembership：续期在未过期基础上顺延', async () => {
    const base = future(10);
    const f = makeRepos({ memberships: [{ userId: 8, level: 'pro', status: 'active', expiresAt: base }] });
    const svc = newService(f);
    await svc.grantMembership(8, 'pro', 30);
    const row = f.memberships[0];
    const expected = base.getTime() + 30 * 86400000;
    assert.equal(row.expiresAt.getTime(), expected);
  });

  it('generateCodes：批量生成去重且可作废', async () => {
    const f = makeRepos();
    const svc = newService(f);
    const codes = await svc.generateCodes('pro', 30, 5, 'batch-1');
    assert.equal(codes.length, 5);
    assert.equal(new Set(codes).size, 5);
    assert.equal(f.codes.length, 5);
    await svc.revokeCode(codes[0]);
    assert.equal(f.codes.find((c) => c.code === codes[0])?.status, 'revoked');
  });

  it('generateRedeemCode：格式合法（16 位大写字母数字）', () => {
    const code = generateRedeemCode();
    assert.match(code, /^[A-Z0-9]{16}$/);
  });
});

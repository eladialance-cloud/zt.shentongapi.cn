/** 发布计划执行（M6）：executePublish 真调公众号 adapter 单元测试 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PublishService } from '../../src/modules/channel/services/publish.service';

function makePlan(overrides: Record<string, unknown> = {}): any {
  return {
    id: 11,
    userId: 7,
    title: '测试文章',
    content: '<p>正文</p>',
    mediaUrls: ['cover-id'],
    targetPlatforms: ['wechat_mp'],
    status: 'approved',
    accountId: 3,
    publishStatus: 'unpublish',
    publishResult: null,
    publishedAt: null,
    ...overrides,
  };
}

interface Deps {
  plan?: any;
  channels?: any[];
  creds?: any;
  publishResult?: { platform: string; success: boolean; externalId?: string; error?: string };
  publishThrows?: string;
  saves: any[];
  findOneCount: number;
}

function makePublishService(d: Deps) {
  const planRepo = {
    findOne: async () => d.plan,
    save: async (p: any) => { d.saves.push(p); return p; },
  };
  const channelService = {
    findActiveChannelsByPlatformForUser: async (_platform: string, _userId: number) => d.channels ?? [],
    decryptCredentials: () => d.creds ?? null,
  };
  const wechatMpAdapter = {
    publishContent: async (_credentials: string, _content: any) => {
      if (d.publishThrows) throw new Error(d.publishThrows);
      return d.publishResult ?? { platform: 'wechat_mp', success: false, error: 'no-op' };
    },
  };
  const service = new PublishService(planRepo as any, channelService as any, wechatMpAdapter as any);
  return { service, d };
}

describe('PublishService.executePublish', () => {
  it('wechat_mp 成功：result.wechat_mp.success=true 且 status=published', async () => {
    const d: Deps = { plan: makePlan(), channels: [{ id: 5 }], creds: { appId: 'wx01', appSecret: 's' }, publishResult: { platform: 'wechat_mp', success: true, externalId: 'wx_pub_1' }, saves: [], findOneCount: 0 };
    const { service } = makePublishService(d);
    const out = await service.executePublish(7, 11);
    assert.equal(out.publishStatus, 'success');
    assert.equal(out.status, 'published');
    assert.equal((out.publishResult as any).platforms.wechat_mp.success, true);
  });

  it('wechat_mp 无渠道：publishStatus=failed 且提示未绑定', async () => {
    const d: Deps = { plan: makePlan(), channels: [], saves: [], findOneCount: 0 };
    const { service } = makePublishService(d);
    const out = await service.executePublish(7, 11);
    assert.equal(out.publishStatus, 'failed');
    assert.equal(out.status, 'failed');
    assert.match(String((out.publishResult as any).platforms.wechat_mp.message), /未绑定/);
  });

  it('wechat_mp adapter 失败：publishStatus=failed', async () => {
    const d: Deps = { plan: makePlan(), channels: [{ id: 5 }], creds: { appId: 'wx01', appSecret: 's' }, publishResult: { platform: 'wechat_mp', success: false, error: '建草稿失败' }, saves: [], findOneCount: 0 };
    const { service } = makePublishService(d);
    const out = await service.executePublish(7, 11);
    assert.equal(out.publishStatus, 'failed');
    assert.match(String((out.publishResult as any).platforms.wechat_mp.message), /建草稿失败/);
  });

  it('多平台（wechat_mp + 未接入平台）：部分成功 => partial', async () => {
    const d: Deps = { plan: makePlan({ targetPlatforms: ['wechat_mp', 'legacy_unknown'] }), channels: [{ id: 5 }], creds: { appId: 'wx01', appSecret: 's' }, publishResult: { platform: 'wechat_mp', success: true, externalId: 'wx_pub_2' }, saves: [], findOneCount: 0 };
    const { service } = makePublishService(d);
    const out = await service.executePublish(7, 11);
    assert.equal(out.publishStatus, 'partial');
    // 部分成功不得落成 published：否则 updatePlan 会以「已发布」为由锁死计划、无法重试
    assert.equal(out.status, 'failed');
    assert.equal((out.publishResult as any).platforms.wechat_mp.success, true);
    assert.equal((out.publishResult as any).platforms.legacy_unknown.success, false);
    assert.match(String((out.publishResult as any).platforms.legacy_unknown.message), /未接入/);
  });

  it('扫码发布平台（douyin）无绑定账号：failed 提示先扫码登录', async () => {
    const d: Deps = { plan: makePlan({ targetPlatforms: ['douyin'] }), channels: [], saves: [], findOneCount: 0 };
    const { service } = makePublishService(d);
    const out = await service.executePublish(7, 11);
    assert.equal(out.publishStatus, 'failed');
    assert.match(String((out.publishResult as any).platforms.douyin.message), /未绑定|扫码/);
  });

  it('扫码发布平台（douyin）有绑定账号：下发桌面端发布', async () => {
    const d: Deps = { plan: makePlan({ targetPlatforms: ['douyin'] }), channels: [{ id: 9 }], saves: [], findOneCount: 0 };
    const { service } = makePublishService(d);
    const out = await service.executePublish(7, 11);
    assert.equal(out.publishStatus, 'success');
    assert.equal((out.publishResult as any).platforms.douyin.success, true);
  });

  it('非 approved 状态拒绝执行', async () => {
    const d: Deps = { plan: makePlan({ status: 'draft' }), saves: [], findOneCount: 0 };
    const { service } = makePublishService(d);
    await assert.rejects(() => service.executePublish(7, 11), /审核通过/);
  });

  it('wechat_mp adapter 抛异常：其余平台仍执行，计划不滞留 approved', async () => {
    const d: Deps = {
      plan: makePlan({ targetPlatforms: ['wechat_mp', 'douyin'] }),
      channels: [{ id: 9 }],
      creds: { appId: 'wx01', appSecret: 's' },
      publishThrows: '微信接口超时',
      saves: [],
      findOneCount: 0,
    };
    const { service } = makePublishService(d);
    const out = await service.executePublish(7, 11);
    assert.equal(out.publishStatus, 'partial');
    assert.equal(out.status, 'failed');
    assert.match(String((out.publishResult as any).platforms.wechat_mp.message), /微信接口超时/);
    // 关键：异常被隔离后 douyin 仍被处理（旧实现会整轮中断并漏记）
    assert.equal((out.publishResult as any).platforms.douyin.success, true);
  });

  it('targetPlatforms 为空：拒绝发布，不默认发到公众号', async () => {
    const d: Deps = {
      plan: makePlan({ targetPlatforms: [] }),
      channels: [{ id: 5 }],
      creds: { appId: 'wx01', appSecret: 's' },
      publishResult: { platform: 'wechat_mp', success: true },
      saves: [],
      findOneCount: 0,
    };
    const { service } = makePublishService(d);
    await assert.rejects(() => service.executePublish(7, 11), /未指定目标平台/);
    assert.equal(d.saves.length, 0);
  });
});

/** 渠道适配器注册表（ChannelAdapterRegistry）单元测试：测试连接的前置校验 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelAdapterRegistry } from '../../src/modules/channel/channel-adapter.registry';
import { FeishuBotAdapter } from '../../src/modules/channel/adapters/feishu-bot.adapter';
import { WechatMpAdapter } from '../../src/modules/channel/adapters/wechat-mp.adapter';
import { WecomAdapter } from '../../src/modules/channel/adapters/wecom.adapter';
import { DingtalkBotAdapter } from '../../src/modules/channel/adapters/dingtalk-bot.adapter';
import { TelegramBotAdapter } from '../../src/modules/channel/adapters/telegram-bot.adapter';
import { WecomBotAdapter } from '../../src/modules/channel/adapters/wecom-bot.adapter';
import { QqBotAdapter } from '../../src/modules/channel/adapters/qq-bot.adapter';

function buildRegistry(): ChannelAdapterRegistry {
  return new ChannelAdapterRegistry(
    new FeishuBotAdapter(),
    new WechatMpAdapter(),
    new WecomAdapter(),
    new DingtalkBotAdapter(),
    new TelegramBotAdapter(),
    new WecomBotAdapter(),
    new QqBotAdapter(),
  );
}

describe('ChannelAdapterRegistry', () => {
  const registry = buildRegistry();

  it('按平台取到适配器，7 个入站平台全部注册', () => {
    assert.deepEqual(
      registry.listPlatforms().sort(),
      ['dingtalk_bot', 'feishu_bot', 'qq_bot', 'telegram_bot', 'wechat_mp', 'wechat_work', 'wecom_bot'].sort(),
    );
    assert.equal(registry.get('telegram_bot')?.platform, 'telegram_bot');
    assert.equal(registry.has('wechat_mp'), true);
  });

  it('发布平台无适配器（扫码发布，不走服务端）', () => {
    assert.equal(registry.has('douyin'), false);
    assert.equal(registry.get('douyin'), undefined);
    // 发布平台给中性提示，不算「未知平台」
    const msg = registry.validateCredentials('douyin', null);
    assert.match(String(msg), /扫码发布平台|桌面端/);
  });

  it('未知平台返回明确错误', () => {
    assert.match(String(registry.validateCredentials('no_such_platform', {})), /未知平台/);
  });

  it('微信 mp 缺 appId/appSecret → 提示缺字段', () => {
    const msg = registry.validateCredentials('wechat_mp', { appId: 'wx123' });
    assert.match(String(msg), /缺少凭证字段/);
    assert.match(String(msg), /AppSecret/);
  });

  it('凭证齐全 → 返回 null（通过静态校验）', () => {
    const msg = registry.validateCredentials('wechat_mp', { appId: 'wx123', appSecret: 'secret123' });
    assert.equal(msg, null);
  });

  it('Telegram 可用 token 别名替代 botToken', () => {
    assert.equal(registry.validateCredentials('telegram_bot', { token: 'abc:def' }), null);
    assert.match(String(registry.validateCredentials('telegram_bot', {})), /缺少凭证字段/);
  });

  it('企业微信群机器人可用 webhookUrl 或 key 任一', () => {
    assert.equal(registry.validateCredentials('wecom_bot', { webhookUrl: 'https://x' }), null);
    assert.equal(registry.validateCredentials('wecom_bot', { key: 'k123' }), null);
    assert.match(String(registry.validateCredentials('wecom_bot', {})), /缺少凭证字段/);
  });

  it('accountName 之类非必填字段不参与校验', () => {
    // 钉钉必填 webhook token（access_token）；只填 accountName 仍报缺
    const msg = registry.validateCredentials('dingtalk_bot', { accountName: '客服A' });
    assert.match(String(msg), /缺少凭证字段/);
  });

  it('healthCheck 在无凭证时静默返回 false 而不抛错', async () => {
    const wecom = registry.get('wecom_bot');
    assert.ok(wecom);
    const ok = await wecom!.healthCheck('{}');
    assert.equal(ok, false);
  });
});

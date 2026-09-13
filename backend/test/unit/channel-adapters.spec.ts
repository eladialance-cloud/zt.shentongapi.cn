/** 新增渠道适配器（钉钉/Telegram/企业微信群机器人/QQ）单元测试 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { DingtalkBotAdapter } from '../../src/modules/channel/adapters/dingtalk-bot.adapter';
import { TelegramBotAdapter } from '../../src/modules/channel/adapters/telegram-bot.adapter';
import { WecomBotAdapter } from '../../src/modules/channel/adapters/wecom-bot.adapter';
import { QqBotAdapter } from '../../src/modules/channel/adapters/qq-bot.adapter';

describe('DingtalkBotAdapter', () => {
  const adapter = new DingtalkBotAdapter();

  it('platform 标识正确', () => {
    assert.equal(adapter.platform, 'dingtalk_bot');
  });

  it('未配置 secret 时跳过验签', () => {
    assert.equal(adapter.verifySignature({}, 'sig', '', '123'), true);
  });

  it('正确的加签通过，错误签名拒绝', () => {
    const secret = 'SECxxxx';
    const timestamp = String(Date.now());
    const sign = crypto.createHmac('sha256', secret).update(`${timestamp}\n${secret}`, 'utf8').digest('base64');
    assert.equal(adapter.verifySignature({}, sign, secret, timestamp), true);
    assert.equal(adapter.verifySignature({}, 'wrong', secret, timestamp), false);
  });

  it('过期时间戳拒绝', () => {
    const secret = 'SECxxxx';
    const stale = String(Date.now() - 2 * 60 * 60 * 1000);
    const sign = crypto.createHmac('sha256', secret).update(`${stale}\n${secret}`, 'utf8').digest('base64');
    assert.equal(adapter.verifySignature({}, sign, secret, stale), false);
  });

  it('解析入站消息、剥离 @ 前缀', () => {
    const msg = adapter.parseInboundMessage({
      senderId: 'u1',
      senderNick: '张三',
      text: { content: '@机器人 帮我看看今天的销量' },
      msgId: 'm1',
    });
    assert.equal(msg?.content, '帮我看看今天的销量');
    assert.equal(msg?.senderExternalId, 'u1');
  });

  it('缺少 senderId 返回 null', () => {
    assert.equal(adapter.parseInboundMessage({ text: { content: 'hi' } }), null);
  });

  it('无 token 时发送失败', async () => {
    const r = await adapter.sendMessage('{}', { targetExternalId: 'u1', content: 'hi' });
    assert.equal(r.success, false);
  });
});

describe('TelegramBotAdapter', () => {
  const adapter = new TelegramBotAdapter();

  it('platform 标识正确', () => {
    assert.equal(adapter.platform, 'telegram_bot');
  });

  it('secret 匹配通过，不匹配/长度不等拒绝', () => {
    assert.equal(adapter.verifySignature({}, 'abc', 'abc'), true);
    assert.equal(adapter.verifySignature({}, 'abc', 'xyz'), false);
    assert.equal(adapter.verifySignature({}, 'ab', 'abc'), false);
  });

  it('未配置 secret 跳过校验', () => {
    assert.equal(adapter.verifySignature({}, '', ''), true);
  });

  it('解析 message 更新', () => {
    const msg = adapter.parseInboundMessage({
      message: { message_id: 9, text: '查一下库存', from: { first_name: '李', last_name: '四' }, chat: { id: 88 } },
    });
    assert.equal(msg?.content, '查一下库存');
    assert.equal(msg?.senderExternalId, '88');
    assert.equal(msg?.senderName, '李 四');
  });

  it('非文本更新返回 null', () => {
    assert.equal(adapter.parseInboundMessage({ message: { message_id: 1, photo: [] } }), null);
  });

  it('无 botToken 发送失败', async () => {
    const r = await adapter.sendMessage('{}', { targetExternalId: '88', content: 'hi' });
    assert.equal(r.success, false);
  });
});

describe('WecomBotAdapter', () => {
  const adapter = new WecomBotAdapter();

  it('platform 标识正确且仅出站', () => {
    assert.equal(adapter.platform, 'wecom_bot');
    assert.equal(adapter.parseInboundMessage({ any: 1 }), null);
  });

  it('key 自动拼 webhook 地址（healthCheck）', async () => {
    assert.equal(await adapter.healthCheck(JSON.stringify({ key: 'abc' })), true);
    assert.equal(await adapter.healthCheck(JSON.stringify({ webhookUrl: 'https://qyapi.weixin.qq.com/x' })), true);
  });

  it('无凭证 healthCheck 为 false', async () => {
    assert.equal(await adapter.healthCheck('{}'), false);
  });

  it('无凭证发送失败', async () => {
    const r = await adapter.sendMessage('{}', { targetExternalId: 'x', content: 'hi' });
    assert.equal(r.success, false);
  });
});

describe('QqBotAdapter', () => {
  const adapter = new QqBotAdapter();

  it('platform 标识正确', () => {
    assert.equal(adapter.platform, 'qq_bot');
  });

  it('token 匹配通过，不匹配拒绝', () => {
    assert.equal(adapter.verifySignature({}, 'tok', 'tok'), true);
    assert.equal(adapter.verifySignature({}, 'bad', 'tok'), false);
  });

  it('解析 d.content 入站消息', () => {
    const msg = adapter.parseInboundMessage({ d: { id: 'm1', content: '你好', author: { id: 'u1', username: '小明' }, channel_id: 'c1' } });
    assert.equal(msg?.content, '你好');
    assert.equal(msg?.sessionId, 'c1');
  });

  it('无 appId 发送失败', async () => {
    const r = await adapter.sendMessage('{}', { targetExternalId: 'u1', content: 'hi' });
    assert.equal(r.success, false);
  });
});

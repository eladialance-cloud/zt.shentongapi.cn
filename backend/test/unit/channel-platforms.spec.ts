/** 渠道平台注册表（频道全量接入）单元测试 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANNEL_PLATFORMS,
  CHANNEL_IM_PLATFORMS,
  CHANNEL_PUBLISH_PLATFORMS,
  getChannelPlatformMeta,
  isKnownChannelPlatform,
  isDesktopDrivenPublishPlatform,
} from '../../src/modules/channel/channel-platforms';

describe('channel-platforms 注册表（频道全量接入）', () => {
  it('登记 15 个平台', () => {
    assert.equal(CHANNEL_PLATFORMS.length, 15);
  });

  it('平台 id 唯一', () => {
    const ids = CHANNEL_PLATFORMS.map((p) => p.platform);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('分类拆分：7 入站消息 + 8 内容发布', () => {
    assert.equal(CHANNEL_IM_PLATFORMS.length, 7);
    assert.equal(CHANNEL_PUBLISH_PLATFORMS.length, 8);
    assert.ok(CHANNEL_IM_PLATFORMS.every((p) => p.category === 'im'));
    assert.ok(CHANNEL_PUBLISH_PLATFORMS.every((p) => p.category === 'publish'));
  });

  it('原先仅出站的钉钉/Telegram/QQ 现已支持入站', () => {
    assert.equal(getChannelPlatformMeta('dingtalk_bot')?.inbound, true);
    assert.equal(getChannelPlatformMeta('telegram_bot')?.inbound, true);
    assert.equal(getChannelPlatformMeta('qq_bot')?.inbound, true);
    assert.equal(getChannelPlatformMeta('wecom_bot')?.inbound, false);
  });

  it('发布平台均为扫码驱动且带页面地址', () => {
    for (const p of CHANNEL_PUBLISH_PLATFORMS) {
      assert.equal(p.connectionType, 'qr');
      assert.equal(isDesktopDrivenPublishPlatform(p.platform), true);
      assert.match(String(p.homeUrl), /^https:\/\//);
      assert.match(String(p.publishUrl), /^https:\/\//);
    }
  });

  it('isKnownChannelPlatform 校验', () => {
    assert.equal(isKnownChannelPlatform('douyin'), true);
    assert.equal(isKnownChannelPlatform('weibo'), true);
    assert.equal(isKnownChannelPlatform('unknown_platform'), false);
  });

  it('每个平台都声明凭证字段数组', () => {
    for (const p of CHANNEL_PLATFORMS) {
      assert.ok(Array.isArray(p.credentialFields));
    }
  });

  it('入站 IM 渠道含接入指引', () => {
    for (const p of CHANNEL_IM_PLATFORMS) {
      assert.ok((p.instructions ?? []).length > 0);
    }
  });
});

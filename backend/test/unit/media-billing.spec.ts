/** 生成类计费纯函数测试
 * 运行: node -r ts-node/register --test test/unit/media-billing.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeVideoCharge } from '../../src/modules/media-generation/billing';

describe('computeVideoCharge 视频按秒计费', () => {
  const model: any = {
    pricingMode: 'per_second',
    videoPerSecond: { '720P': 2, '1080P': 4 },
    videoPrices: null,
  };
  it('per_second 按分辨率档单价 x 时长', () => {
    assert.equal(computeVideoCharge(model, { resolution: '1080P', duration: 15 }), 60);
    assert.equal(computeVideoCharge(model, { resolution: '720P', duration: 10 }), 20);
  });
  it('缺少分辨率档时回退 0', () => {
    assert.equal(computeVideoCharge(model, { resolution: '4K', duration: 5 }), 0);
  });
  it('回退旧矩阵（pricing_mode 非 per_second）', () => {
    const legacy: any = { pricingMode: null, videoPerSecond: null, videoPrices: { '1080P': { 15: 80 } } };
    assert.equal(computeVideoCharge(legacy, { resolution: '1080P', duration: 15 }), 80);
  });
});

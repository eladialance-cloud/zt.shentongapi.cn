/** 模型市场工具函数测试
 * 运行: node -r ts-node/register --test test/unit/market-presets.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { marketPresetsForVendor, resolvePricing } from '../../src/modules/admin-model/utils/market-utils';
import { MODEL_TEMPLATES } from '../../src/modules/admin-model/constants/model-templates';

describe('模型市场工具', () => {
  it('marketPresetsForVendor 按厂商过滤', () => {
    const dash = marketPresetsForVendor('aliyun-dashscope');
    assert.ok(dash.length >= 10);
    assert.ok(dash.every((t) => t.vendor === 'aliyun-dashscope'));
    assert.equal(marketPresetsForVendor('unknown-vendor').length, 0);
  });
  it('resolvePricing 默认取 referencePrice', () => {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === 'qwen-plus')!;
    const p = resolvePricing(tpl);
    assert.equal(p.pricePer1kInput, 0.8);
    assert.equal(p.pricePer1kOutput, 2);
  });
  it('resolvePricing 管理员覆盖参考积分', () => {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === 'qwen-plus')!;
    const p = resolvePricing(tpl, { inputPricePerToken: 1.5, outputPricePerToken: 3 });
    assert.equal(p.pricePer1kInput, 1.5);
    assert.equal(p.pricePer1kOutput, 3);
  });
  it('resolvePricing 显式 null 清空（不回退参考值）', () => {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === 'qwen-plus')!;
    const p = resolvePricing(tpl, { inputPricePerToken: null, outputPricePerToken: null });
    assert.equal(p.pricePer1kInput, null);
    assert.equal(p.pricePer1kOutput, null);
  });
  it('resolvePricing 0 视为 0', () => {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === 'qwen-plus')!;
    const p = resolvePricing(tpl, { inputPricePerToken: 0, outputPricePerToken: 0 });
    assert.equal(p.pricePer1kInput, 0);
    assert.equal(p.pricePer1kOutput, 0);
  });
  it('resolvePricing 部分覆盖时未覆盖字段回退参考值', () => {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === 'qwen-plus')!;
    const p = resolvePricing(tpl, { inputPricePerToken: 1.5 });
    assert.equal(p.pricePer1kInput, 1.5);
    assert.equal(p.pricePer1kOutput, 2);
  });
  it('resolvePricing 视频分辨率档覆盖', () => {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === 'wan2.2-t2v')!;
    const p = resolvePricing(tpl, { videoPerSecond: { '720P': 3, '1080P': 6 } });
    assert.deepEqual(p.videoPerSecond, { '720P': 3, '1080P': 6 });
  });
  it('resolvePricing 视频档整体替换（不做按键合并）', () => {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === 'wan2.2-t2v')!;
    const p = resolvePricing(tpl, { videoPerSecond: { '720P': 3 } });
    assert.deepEqual(p.videoPerSecond, { '720P': 3 });
  });
  it('resolvePricing videoPerSecond null / 非法值清空', () => {
    const tpl = MODEL_TEMPLATES.find((t) => t.key === 'wan2.2-t2v')!;
    assert.equal(resolvePricing(tpl, { videoPerSecond: null }).videoPerSecond, null);
    assert.equal(resolvePricing(tpl, { videoPerSecond: 'x' as unknown }).videoPerSecond, null);
  });
});
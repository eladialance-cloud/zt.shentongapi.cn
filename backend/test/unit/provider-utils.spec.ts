/** 供应商工具函数单元测试
 * 运行: node -r ts-node/register --test test/unit/provider-utils.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSlug,
  buildUniqueModelId,
  parseUpstreamModels,
  calculateCreditCost,
} from '../../src/modules/admin-model/utils/provider-utils';

describe('buildSlug', () => {
  it('英文小写+去空格', () => {
    assert.equal(buildSlug('My Provider'), 'my-provider');
  });
  it('中文保留', () => {
    assert.equal(buildSlug('汇智中转'), '汇智中转');
  });
  it('空串回退 provider', () => {
    assert.equal(buildSlug('   '), 'provider');
  });
});

describe('buildUniqueModelId', () => {
  it('无冲突返回原 ID', () => {
    assert.equal(buildUniqueModelId('gpt-4o', 's2', new Set(['a'])), 'gpt-4o');
  });
  it('冲突时加 @slug 后缀', () => {
    assert.equal(buildUniqueModelId('gpt-4o', 's2', new Set(['gpt-4o'])), 'gpt-4o@s2');
  });
  it('仍冲突则递增 -2 -3', () => {
    const existing = new Set(['gpt-4o', 'gpt-4o@s2', 'gpt-4o@s2-2']);
    assert.equal(buildUniqueModelId('gpt-4o', 's2', existing), 'gpt-4o@s2-3');
  });
  it('超长截断到 64', () => {
    const long = 'x'.repeat(80);
    assert.ok(buildUniqueModelId(long, 's2', new Set()).length <= 64);
  });

  it('超长 slug 冲突时结果仍不超长', () => {
    const longSlug = 's'.repeat(64);
    const existing = new Set(['a']);
    const result = buildUniqueModelId('gpt-4o', longSlug, existing);
    assert.ok(result.length <= 64);
    assert.ok(!existing.has(result));
  });
  it('超长冲突时返回不在集合中的值且不无限循环', () => {
    const long = 'x'.repeat(80);
    const existing = new Set(['x'.repeat(64)]);
    const result = buildUniqueModelId(long, 's2', existing);
    assert.ok(result.length <= 64);
    assert.ok(!existing.has(result));
  });
});

describe('parseUpstreamModels', () => {
  it('标准 {data:[...]} 结构', () => {
    const raw = {
      data: [
        { id: 'gpt-4o', owned_by: 'openai', api: { metadata: { input: 0.017, output: 0.068 } } },
        { id: 'deepseek-chat' },
      ],
    };
    const list = parseUpstreamModels(raw);
    assert.equal(list.length, 2);
    assert.equal(list[0].modelId, 'gpt-4o');
    assert.equal(list[0].upstreamInputPrice, 0.017);
    assert.equal(list[0].upstreamOutputPrice, 0.068);
  });
  it('数组结构 + 无价格', () => {
    const list = parseUpstreamModels([{ id: 'm1' }, { id: 'm2' }]);
    assert.equal(list.length, 2);
    assert.equal(list[0].upstreamInputPrice, undefined);
  });
  it('空/坏数据返回空数组', () => {
    assert.deepEqual(parseUpstreamModels(null), []);
    assert.deepEqual(parseUpstreamModels({}), []);
  });
  it('数组含 null/undefined 条目跳过不抛错', () => {
    const list = parseUpstreamModels([null, { id: 'm1' }, undefined]);
    assert.equal(list.length, 1);
    assert.equal(list[0].modelId, 'm1');
    const list2 = parseUpstreamModels({ data: [{ id: 'a' }, null] });
    assert.equal(list2.length, 1);
    assert.equal(list2[0].modelId, 'a');
  });
});

describe('calculateCreditCost', () => {
  it('积分/千token 直接换算', () => {
    assert.equal(calculateCreditCost({ input: 1000, output: 500 }, 170, 680), 510);
  });
  it('价格为 null 返回 null（走默认扣费）', () => {
    assert.equal(calculateCreditCost({ input: 1000, output: 500 }, null, null), null);
  });
  it('0 是合法免费价格', () => {
    assert.equal(calculateCreditCost({ input: 1000, output: 500 }, 0, 0), 0);
  });
  it('小数向上取整', () => {
    assert.equal(calculateCreditCost({ input: 1, output: 1 }, 1, 1), 1);
  });
  it('NaN 价格返回 null', () => {
    assert.equal(calculateCreditCost({ input: 1000, output: 500 }, NaN, 680), null);
    assert.equal(calculateCreditCost({ input: 1000, output: 500 }, 170, NaN), null);
  });
  it('负 token 数按 0 处理', () => {
    assert.equal(calculateCreditCost({ input: -1000, output: 500 }, 170, 680), 340);
    assert.equal(calculateCreditCost({ input: -1000, output: -500 }, 170, 680), 0);
  });
  it('负价格按 0 处理（不产生负成本）', () => {
    assert.equal(calculateCreditCost({ input: 1000, output: 500 }, -170, -680), 0);
  });
});
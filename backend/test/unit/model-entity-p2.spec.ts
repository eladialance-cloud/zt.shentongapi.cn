/** 实体新增列测试
 * 运行: node -r ts-node/register --test test/unit/model-entity-p2.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ModelEntity } from '../../src/modules/model/entities/model.entity';

describe('ModelEntity pricePerMinute', () => {
  it('可赋值按分钟单价（积分/分钟）', () => {
    const m = new ModelEntity();
    m.pricePerMinute = 3.5;
    assert.equal(m.pricePerMinute, 3.5);
  });
});

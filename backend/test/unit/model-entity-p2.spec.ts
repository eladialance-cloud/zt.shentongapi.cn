/** 实体新增列测试（P5 拆分后价格列归属 ai_model_pricing）
 * 运行: node -r ts-node/register --test test/unit/model-entity-p2.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ModelPricingEntity } from '../../src/modules/admin-model/entities/model-pricing.entity';

describe('ModelPricingEntity pricePerMinute', () => {
  it('可按分钟单价（积分/分钟）', () => {
    const p = new ModelPricingEntity();
    p.pricePerMinute = 3.5;
    assert.equal(p.pricePerMinute, 3.5);
  });
});

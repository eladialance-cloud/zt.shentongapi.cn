/** 余额阈值告警纯逻辑测试
 * 运行: node -r ts-node/register --test test/unit/balance-monitor.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldAlertBalance } from '../../src/modules/admin-model/utils/balance-utils';

describe('shouldAlertBalance 余额告警判定', () => {
  it('低于阈值告警', () => {
    assert.equal(shouldAlertBalance(5, 10), true);
  });
  it('等于阈值不告警', () => {
    assert.equal(shouldAlertBalance(10, 10), false);
  });
  it('阈值未配置不告警', () => {
    assert.equal(shouldAlertBalance(0, null), false);
    assert.equal(shouldAlertBalance(0, undefined), false);
  });
});
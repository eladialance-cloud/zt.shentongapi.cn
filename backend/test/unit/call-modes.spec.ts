/** call_modes 字典不变量测试
 * 运行: node -r ts-node/register --test test/unit/call-modes.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CALL_MODES,
  CALL_MODE_KEYS,
  MODEL_TYPE_TO_CALL_MODE,
  CALL_MODE_TO_MODEL_TYPE,
  SCENARIO_TAGS,
} from '../../src/modules/admin-model/constants/call-modes';

describe('call_modes 字典', () => {
  it('共 14 种调用模式', () => {
    assert.equal(CALL_MODES.length, 14);
  });
  it('key 唯一且与 CALL_MODE_KEYS 一致', () => {
    const keys = CALL_MODES.map((m) => m.key);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual([...CALL_MODE_KEYS], keys);
  });
  it('输出类型合法（text/image/video/audio）', () => {
    for (const m of CALL_MODES) {
      assert.ok(['text', 'image', 'video', 'audio'].includes(m.output), `${m.key} 输出非法`);
    }
  });
  it('计费方式合法', () => {
    const BILLING = new Set(['token', 'per_image', 'per_call', 'per_minute', 'per_second']);
    for (const m of CALL_MODES) {
      for (const b of m.billingModes) {
        assert.ok(BILLING.has(b), `${m.key} 计费方式非法: ${b}`);
      }
    }
  });
  it('recommendedBilling 属于该模式 billingModes', () => {
    for (const m of CALL_MODES) {
      assert.ok(m.billingModes.includes(m.recommendedBilling), `${m.key} recommendedBilling 不在 billingModes 中`);
    }
  });
  it('recommendedScenarioTags 均属于 SCENARIO_TAGS', () => {
    const tags: Set<string> = new Set(SCENARIO_TAGS);
    for (const m of CALL_MODES) {
      for (const tag of m.recommendedScenarioTags) {
        assert.ok(tags.has(tag), `${m.key} 场景标签非法: ${tag}`);
      }
    }
  });
  it('存量 model_type 均有 call_mode 映射', () => {
    // 存在性校验遍历 MODEL_TYPE_TO_CALL_MODE 全量键
    for (const t of Object.keys(MODEL_TYPE_TO_CALL_MODE)) {
      const cm = MODEL_TYPE_TO_CALL_MODE[t];
      assert.ok(cm, `缺少映射: ${t}`);
      assert.ok(CALL_MODE_TO_MODEL_TYPE[cm], `call_mode 无反向条目: ${cm}`);
    }
    // reasoning/embedding/audio 为单向别名映射，不参与互推校验
    for (const t of ['chat', 'vision', 'image', 'image_edit', 'video', 'tts']) {
      const back = CALL_MODE_TO_MODEL_TYPE[MODEL_TYPE_TO_CALL_MODE[t]];
      assert.equal(back, t, `互推不一致: ${t}`);
    }
  });
});
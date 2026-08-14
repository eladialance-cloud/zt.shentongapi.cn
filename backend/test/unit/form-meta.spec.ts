/** 动态表单元数据不变量测试
 * 运行: node -r ts-node/register --test test/unit/form-meta.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SPEC_FIELD_SCHEMAS, ADVANCED_CAP_LABELS } from '../../src/modules/admin-model/constants/form-meta';
import { CALL_MODES } from '../../src/modules/admin-model/constants/call-modes';

describe('动态表单元数据', () => {
  it('call-modes 字典中所有 specFields 都有 schema 定义', () => {
    const used = new Set<string>();
    for (const m of CALL_MODES) for (const f of m.specFields) used.add(f);
    const missing = [...used].filter((f) => !SPEC_FIELD_SCHEMAS[f]);
    assert.deepEqual(missing, []);
  });
  it('高级能力标签覆盖字典 advancedCaps', () => {
    const used = new Set<string>();
    for (const m of CALL_MODES) for (const c of m.advancedCaps) used.add(c);
    const missing = [...used].filter((c) => !ADVANCED_CAP_LABELS[c]);
    assert.deepEqual(missing, []);
  });
  it('schema 类型合法', () => {
    const TYPES = ['number', 'text', 'select', 'multiselect', 'json', 'boolean'];
    for (const s of Object.values(SPEC_FIELD_SCHEMAS)) {
      assert.ok(TYPES.includes(s.type), `非法类型: ${s.type}`);
    }
  });
});
/** 模板库 seed 不变量测试
 * 运行: node -r ts-node/register --test test/unit/model-templates.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL_TEMPLATES } from '../../src/modules/admin-model/constants/model-templates';
import { CALL_MODES, SCENARIO_TAGS } from '../../src/modules/admin-model/constants/call-modes';

describe('模板库 seed', () => {
  it('key 唯一', () => {
    const keys = MODEL_TEMPLATES.map((t) => t.key);
    assert.equal(new Set(keys).size, keys.length);
  });
  it('callMode 均在字典内且 specValues 不超 specFields', () => {
    for (const t of MODEL_TEMPLATES) {
      const def = CALL_MODES.find((m) => m.key === t.callMode);
      assert.ok(def, `${t.key} callMode 非法`);
      for (const k of Object.keys(t.specValues ?? {})) {
        assert.ok(def.specFields.includes(k), `${t.key} 规格 ${k} 不在 ${t.callMode}.specFields`);
      }
    }
  });
  it('覆盖主要千问系列', () => {
    for (const key of ['qwen-plus', 'qwen-flash', 'qwen-long', 'qwen-vl-plus', 'qwen-ocr', 'qwen-image', 'wanx-sketch', 'wan2.2-t2v', 'qwen-audio-asr', 'qwen-tts', 'text-embedding-v3', 'text-rerank-v1']) {
      assert.ok(MODEL_TEMPLATES.some((t) => t.key === key), `缺少模板 ${key}`);
    }
  });
  it('recommendedScenarioTags 均属于 SCENARIO_TAGS', () => {
    const tags: Set<string> = new Set(SCENARIO_TAGS);
    for (const t of MODEL_TEMPLATES) {
      for (const tag of t.recommendedScenarioTags) {
        assert.ok(tags.has(tag), `${t.key} 场景标签非法: ${tag}`);
      }
    }
  });
});
describe('模板库 generationParams 专用配置契约', () => {
  const long = MODEL_TEMPLATES.find((t) => t.key === 'qwen-long')!;
  const mt = MODEL_TEMPLATES.find((t) => t.key === 'qwen-mt-flash')!;
  const research = MODEL_TEMPLATES.find((t) => t.key === 'qwen-deep-research')!;

  it('qwen-long 配置两步式：submit_path + file_id_required + file_id_path', () => {
    assert.equal(long.generationParams.file_id_required, true);
    assert.ok(String(long.generationParams.submit_path).includes('file-uploads'));
    assert.equal(long.generationParams.file_id_path, 'file_id');
    assert.equal(long.generationParams.chat_files_field, 'files');
  });
  it('qwen-mt-flash 配置翻译参数 chat_body_extra.target_lang', () => {
    const extra = mt.generationParams.chat_body_extra as Record<string, unknown>;
    assert.equal(extra.target_lang, 'zh');
  });
  it('qwen-deep-research 配置联网参数 chat_body_extra.enable_search', () => {
    const extra = research.generationParams.chat_body_extra as Record<string, unknown>;
    assert.equal(extra.enable_search, true);
  });
});
describe('模板库 image_edit 创意工具模板契约', () => {
  it('wanx-sketch 为 image_edit 且 generationParams 配置合法', () => {
    const t = MODEL_TEMPLATES.find((x) => x.key === 'wanx-sketch');
    assert.ok(t, '缺少 wanx-sketch 模板');
    assert.equal(t.callMode, 'image_edit');
    const gen = t.generationParams as Record<string, unknown>;
    assert.equal(gen.images_style, 'multipart');
    assert.deepEqual(gen.image_fields, ['sketch']);
    assert.equal(gen.prompt_field, 'prompt');
    assert.equal(gen.model_field, 'model');
    assert.ok(String(gen.images_path).startsWith('/'));
  });
});

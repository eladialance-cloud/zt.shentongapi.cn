/** 模型类型工具函数单元测试
 * 运行: node -r ts-node/register --test test/unit/model-type-utils.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveModelType,
  outputTypeFromModelType,
  inputTypesFromModelType,
  normalizeInputTypes,
  normalizeAdvancedCapabilities,
  callModeFromModelType,
  modelTypeFromCallMode,
} from '../../src/modules/admin-model/utils/model-type-utils';

describe('deriveModelType（输出类型 × 输入类型 -> 路由分类）', () => {
  it('文本 + 文字 -> chat', () => {
    assert.equal(deriveModelType('text', ['text']), 'chat');
  });
  it('文本 + 文字/图片 -> vision（图片识图）', () => {
    assert.equal(deriveModelType('text', ['text', 'image']), 'vision');
  });
  it('图片 + 文字 -> image（文生图）', () => {
    assert.equal(deriveModelType('image', ['text']), 'image');
  });
  it('图片 + 文字/图片 -> image_edit（图生图）', () => {
    assert.equal(deriveModelType('image', ['text', 'image']), 'image_edit');
  });
  it('视频 -> video', () => {
    assert.equal(deriveModelType('video', ['text']), 'video');
  });
  it('语音 -> tts', () => {
    assert.equal(deriveModelType('audio', ['text']), 'tts');
  });
  it('缺省回退 chat', () => {
    assert.equal(deriveModelType(undefined, undefined), 'chat');
  });
});

describe('outputTypeFromModelType（路由分类 -> 输出类型）', () => {
  it('chat/vision -> text', () => {
    assert.equal(outputTypeFromModelType('chat'), 'text');
    assert.equal(outputTypeFromModelType('vision'), 'text');
  });
  it('image/image_edit -> image', () => {
    assert.equal(outputTypeFromModelType('image'), 'image');
    assert.equal(outputTypeFromModelType('image_edit'), 'image');
  });
  it('video/tts -> video/audio', () => {
    assert.equal(outputTypeFromModelType('video'), 'video');
    assert.equal(outputTypeFromModelType('tts'), 'audio');
  });
});

describe('inputTypesFromModelType（路由分类 -> 默认输入类型）', () => {
  it('vision/image_edit 含图片', () => {
    assert.deepEqual(inputTypesFromModelType('vision'), ['text', 'image']);
    assert.deepEqual(inputTypesFromModelType('image_edit'), ['text', 'image']);
  });
  it('chat/image/video/tts 仅文字', () => {
    assert.deepEqual(inputTypesFromModelType('chat'), ['text']);
    assert.deepEqual(inputTypesFromModelType('image'), ['text']);
    assert.deepEqual(inputTypesFromModelType('video'), ['text']);
    assert.deepEqual(inputTypesFromModelType('tts'), ['text']);
  });
});

describe('normalizeInputTypes / normalizeAdvancedCapabilities', () => {
  it('过滤非法值并去重', () => {
    assert.deepEqual(
      normalizeInputTypes(['text', 'image', 'foo', 'text']),
      ['text', 'image'],
    );
  });
  it('空回退文字', () => {
    assert.deepEqual(normalizeInputTypes([]), ['text']);
    assert.deepEqual(normalizeInputTypes(undefined), ['text']);
  });
  it('高级能力过滤非法值', () => {
    assert.deepEqual(
      normalizeAdvancedCapabilities(['function_calling', 'bar']),
      ['function_calling'],
    );
    assert.deepEqual(normalizeAdvancedCapabilities(undefined), []);
  });
});

describe('callModeFromModelType / modelTypeFromCallMode 互推', () => {
  it('存量 6 类映射正确', () => {
    assert.equal(callModeFromModelType('chat'), 'text_chat');
    assert.equal(callModeFromModelType('vision'), 'vision');
    assert.equal(callModeFromModelType('image'), 'image');
    assert.equal(callModeFromModelType('image_edit'), 'image_edit');
    assert.equal(callModeFromModelType('video'), 'video');
    assert.equal(callModeFromModelType('tts'), 'tts');
  });
  it('未知 model_type 回退 text_chat', () => {
    assert.equal(callModeFromModelType(undefined), 'text_chat');
    assert.equal(callModeFromModelType('unknown'), 'text_chat');
  });
  it('新模式可反推兼容 model_type', () => {
    assert.equal(modelTypeFromCallMode('ocr'), 'vision');
    assert.equal(modelTypeFromCallMode('music'), 'tts');
    assert.equal(modelTypeFromCallMode('video_edit'), 'video');
    assert.equal(modelTypeFromCallMode('stt'), 'chat');
  });
});

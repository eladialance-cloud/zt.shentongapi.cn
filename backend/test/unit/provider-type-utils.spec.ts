/** 供应商按类型匹配端点/预设 工具函数测试
 * 运行: node -r ts-node/register --test test/unit/provider-type-utils.spec.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  endpointsForProviderType,
  outputTypeOfCallMode,
  presetsForProviderType,
  PROVIDER_TYPE_LABELS,
} from '../../src/modules/admin-model/utils/provider-type-utils';
import { MODEL_TEMPLATES, PROVIDER_TEMPLATES } from '../../src/modules/admin-model/constants/model-templates';
import { CALL_MODES } from '../../src/modules/admin-model/constants/call-modes';

const dash = PROVIDER_TEMPLATES.find((p) => p.vendor === 'aliyun-dashscope')!;
const relay = PROVIDER_TEMPLATES.find((p) => p.vendor === 'relay')!;

describe('供应商按类型匹配端点（同一 Key，URL 后缀不同）', () => {
  it('对话类型 -> 对话路径 + 模型列表路径', () => {
    const hints = endpointsForProviderType(dash, 'chat');
    assert.deepEqual(hints, [
      { label: '对话', path: '/chat/completions' },
      { label: '模型列表', path: '/models' },
    ]);
  });

  it('图片类型 -> 自动匹配文生图/图生图生成端点（绝对 URL）', () => {
    const hints = endpointsForProviderType(dash, 'image');
    assert.ok(hints.length >= 1);
    assert.ok(hints[0].path.includes('/images/generations'));
  });

  it('视频类型 -> 自动匹配视频生成 + 异步任务查询端点', () => {
    const hints = endpointsForProviderType(dash, 'video');
    const labels = hints.map((h) => h.label);
    assert.ok(labels.includes('视频生成'));
    assert.ok(labels.includes('异步任务查询'));
    assert.ok(hints.some((h) => h.path.includes('/video-synthesis')));
  });

  it('中转/自建（无 generation 模板）图片/视频无专属端点提示', () => {
    assert.equal(endpointsForProviderType(relay, 'image').length, 0);
    assert.equal(endpointsForProviderType(relay, 'video').length, 0);
    // 中转对话/读取仍走 OpenAI 兼容路径
    assert.deepEqual(endpointsForProviderType(relay, 'chat').map((h) => h.path), [
      '/v1/chat/completions',
      '/v1/models',
    ]);
  });
});

describe('按供应商类型过滤官方预设（图片/视频平台无列表接口时的兜底读取）', () => {
  it('图片类型 -> 只含 image/image_edit 预设（通义万相/文生图）', () => {
    const presets = presetsForProviderType(MODEL_TEMPLATES, 'image', CALL_MODES);
    assert.ok(presets.length >= 2);
    assert.ok(presets.every((t) => t.callMode === 'image' || t.callMode === 'image_edit'));
    assert.ok(presets.some((t) => t.key === 'qwen-image'));
    assert.ok(presets.some((t) => t.key === 'wanx-sketch'));
    assert.ok(!presets.some((t) => t.key === 'wan2.2-t2v'));
  });

  it('视频类型 -> 只含 video/video_edit 预设（wan2.2-t2v）', () => {
    const presets = presetsForProviderType(MODEL_TEMPLATES, 'video', CALL_MODES);
    assert.ok(presets.length >= 1);
    assert.ok(presets.every((t) => t.callMode === 'video' || t.callMode === 'video_edit'));
    assert.ok(presets.some((t) => t.key === 'wan2.2-t2v'));
    assert.ok(!presets.some((t) => t.key === 'qwen-image'));
  });

  it('对话类型 -> 只含文本输出预设（不含图片/视频）', () => {
    const presets = presetsForProviderType(MODEL_TEMPLATES, 'chat', CALL_MODES);
    assert.ok(presets.length >= 10);
    assert.ok(presets.some((t) => t.key === 'qwen-plus'));
    assert.ok(presets.some((t) => t.key === 'qwen-ocr')); // OCR 输出文本
    assert.ok(!presets.some((t) => t.key === 'qwen-image'));
    assert.ok(!presets.some((t) => t.key === 'wan2.2-t2v'));
  });

  it('outputTypeOfCallMode 推导输出类型', () => {
    assert.equal(outputTypeOfCallMode('image', CALL_MODES), 'image');
    assert.equal(outputTypeOfCallMode('video', CALL_MODES), 'video');
    assert.equal(outputTypeOfCallMode('text_chat', CALL_MODES), 'text');
    assert.equal(outputTypeOfCallMode('unknown', CALL_MODES), 'text');
  });

  it('类型标签字典完整', () => {
    assert.equal(PROVIDER_TYPE_LABELS.chat, '对话（文本输出）');
    assert.equal(PROVIDER_TYPE_LABELS.image, '图片');
    assert.equal(PROVIDER_TYPE_LABELS.video, '视频');
  });
});

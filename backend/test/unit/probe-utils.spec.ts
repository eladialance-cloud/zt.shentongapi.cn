import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyProbeError,
  probeNeedsFileInput,
} from '../../src/modules/admin-model/utils/probe-utils';

describe('classifyProbeError', () => {
  it('模型未开通/不存在 → not_activated', () => {
    const r = classifyProbeError('HTTP 400: {"code":"InvalidParameter","message":"Model not exist."}');
    assert.equal(r.verdict, 'not_activated');
    assert.ok(r.message.includes('未开通'));
    assert.ok(r.message.includes('控制台'));
  });
  it('未开通关键词（未开通/不存在）→ not_activated', () => {
    const r = classifyProbeError('上游返回：模型未开通或不存在');
    assert.equal(r.verdict, 'not_activated');
  });
  it('配置错误（URL 错误等）→ config_error', () => {
    const r = classifyProbeError('HTTP 400: url error, please check url!');
    assert.equal(r.verdict, 'config_error');
    assert.ok(r.message.includes('配置错误'));
  });
  it('鉴权错误 → config_error（不是未开通）', () => {
    const r = classifyProbeError('HTTP 401: Incorrect API key provided');
    assert.equal(r.verdict, 'config_error');
  });
});

describe('probeNeedsFileInput', () => {
  it('图生图/图生视频/OCR/STT/变声需要文件输入', () => {
    assert.equal(probeNeedsFileInput('image_edit', {}), true);
    assert.equal(probeNeedsFileInput('video_edit', {}), true);
    assert.equal(probeNeedsFileInput('ocr', {}), true);
    assert.equal(probeNeedsFileInput('stt', {}), true);
    assert.equal(probeNeedsFileInput('voice_conversion', {}), true);
  });
  it('i2v 视频（generationParams.i2v=true）需要首帧图', () => {
    assert.equal(probeNeedsFileInput('video', { i2v: true }), true);
    assert.equal(probeNeedsFileInput('video', {}), false);
  });
  it('文生图/文本对话可自动探测', () => {
    assert.equal(probeNeedsFileInput('image', {}), false);
    assert.equal(probeNeedsFileInput('text_chat', {}), false);
    assert.equal(probeNeedsFileInput('tts', {}), false);
  });
});

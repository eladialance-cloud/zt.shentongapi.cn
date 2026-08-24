/** 火山声音克隆适配器单元测试（mock fetch，不依赖真实网络）
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-voice-adapter.spec.ts
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  VoiceCloneAdapter,
  VoiceCloneError,
  type VolcanoVoiceConfig,
} from '../../src/modules/oral-workshop/adapters/voice.adapter';

const cfg: VolcanoVoiceConfig = {
  endpoint: 'https://ark.example.com/api/v3',
  apiKey: 'test-key',
  model: 'tts-model-1',
  clonePath: '/audio/voice/clone',
  ttsPath: '/tts',
  timeoutMs: 5000,
};

function jsonResp(obj: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(obj),
    json: async () => obj,
    arrayBuffer: async () => Buffer.from(JSON.stringify(obj)),
    headers: { get: (k: string) => headers[k.toLowerCase()] || null },
  } as any;
}

/** 参考音频二进制响应（下载 refAudioUrl 时命中） */
function binaryResp(bytes: string) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from(bytes),
    headers: { get: () => 'audio/mpeg' },
  } as any;
}

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe('VoiceCloneAdapter', () => {
  it('cloneSpeaker：multipart 提交参考音频并返回 speaker_id', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    (globalThis as any).fetch = async (url: string, opts: any) => {
      calls.push({ url, opts });
      return jsonResp({ code: 200, data: { speaker_id: 'spk_123' } });
    };
    const svc = new VoiceCloneAdapter(cfg);
    const speakerId = await svc.cloneSpeaker({
      refAudioUrl: 'https://cdn/ref.mp3',
      refAudioFormat: 'mp3',
      refAudioText: '参考音频文本',
      text: '测试文案',
      userId: 7,
    });
    assert.equal(speakerId, 'spk_123');
    assert.equal(calls.length, 2); // 下载参考音频 + 复刻
    const cloneCall = calls[1];
    assert.ok(cloneCall.url.endsWith('/audio/voice/clone'));
    assert.equal(cloneCall.opts.method, 'POST');
    assert.ok(cloneCall.opts.headers.Authorization.startsWith('Bearer test-key'));
    const body = cloneCall.opts.body as Buffer;
    assert.ok(body.toString('utf8').includes('audio_format'));
    assert.ok(body.toString('utf8').includes('spk'));
  });

  it('cloneSpeaker：已有 speakerId 时跳过复刻请求', async () => {
    let fetchCalls = 0;
    (globalThis as any).fetch = async () => { fetchCalls += 1; return jsonResp({}); };
    const svc = new VoiceCloneAdapter(cfg);
    const id = await svc.cloneSpeaker({ refAudioUrl: 'x.mp3', text: 't', speakerId: 'spk_existing' });
    assert.equal(id, 'spk_existing');
    assert.equal(fetchCalls, 0);
  });

  it('cloneSpeaker：上游非 2xx 抛 VoiceCloneError', async () => {
    (globalThis as any).fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' } as any);
    const svc = new VoiceCloneAdapter(cfg);
    await assert.rejects(
      () => svc.cloneSpeaker({ refAudioUrl: 'https://cdn/ref.mp3', text: 't' }),
      VoiceCloneError,
    );
  });

  it('synthesize：JSON 响应 audio_base64 解码为音频 buffer', async () => {
    let captured: any = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      if (url.endsWith('/audio/voice/clone')) return jsonResp({ data: { speaker_id: 'spk_1' } });
      if (url.endsWith('/tts')) {
        captured = JSON.parse(opts.body);
        return jsonResp({ data: { audio_base64: Buffer.from('audio-bytes').toString('base64') } }, 200, { 'content-type': 'application/json' });
      }
      return binaryResp('REF-AUDIO');
    };
    const svc = new VoiceCloneAdapter(cfg);
    const out = await svc.synthesize({ refAudioUrl: 'https://cdn/ref.mp3', refAudioText: '参考', text: '你好世界', speedRatio: 0.9 });
    assert.equal(out.audio.toString('utf8'), 'audio-bytes');
    assert.equal(out.mimeType, 'audio/mpeg');
    assert.equal(captured.model, 'tts-model-1');
    assert.equal(captured.speaker_id, 'spk_1');
    assert.equal(captured.speed_ratio, 0.9);
    assert.equal(captured.response_format, 'mp3');
    assert.equal(captured.text, '你好世界');
  });

  it('synthesize：二进制响应直接返回 buffer', async () => {
    (globalThis as any).fetch = async (url: string) => {
      if (url.endsWith('/audio/voice/clone')) return jsonResp({ data: { speaker_id: 'spk_1' } });
      if (url.endsWith('/tts')) return binaryResp('MP3DATA');
      return binaryResp('REF-AUDIO');
    };
    const svc = new VoiceCloneAdapter(cfg);
    const out = await svc.synthesize({ refAudioUrl: 'https://cdn/ref.mp3', text: 'x' });
    assert.equal(out.audio.toString('utf8'), 'MP3DATA');
  });

  it('generateVoice：克隆 + TTS 返回 speakerId 与音频', async () => {
    (globalThis as any).fetch = async (url: string) => {
      if (url.endsWith('/audio/voice/clone')) return jsonResp({ data: { speaker_id: 'spk_gen' } });
      if (url.endsWith('/tts')) return jsonResp({ data: { audio_base64: Buffer.from('GEN').toString('base64') } }, 200, { 'content-type': 'application/json' });
      return binaryResp('REF-AUDIO');
    };
    const svc = new VoiceCloneAdapter(cfg);
    const res = await svc.generateVoice({ refAudioUrl: 'https://cdn/ref.mp3', refAudioText: '参考', text: 't' });
    assert.equal(res.speakerId, 'spk_gen');
    assert.equal(res.audioBuffer.toString('utf8'), 'GEN');
  });

  it('buildMultipart：包含 boundary 与字段', () => {
    const svc = new VoiceCloneAdapter(cfg);
    const body = svc.buildMultipart(Buffer.from('FILE'), 'audio', { audio_format: 'mp3', audio_text: '参考' }, 'BOUND1');
    const txt = body.toString('utf8');
    assert.ok(txt.includes('--BOUND1'));
    assert.ok(txt.includes('name="audio_format"'));
    assert.ok(txt.includes('name="audio"'));
    assert.ok(txt.includes('filename="ref.mp3"'));
    assert.ok(txt.endsWith('--BOUND1--' + '\r\n'));
  });
});

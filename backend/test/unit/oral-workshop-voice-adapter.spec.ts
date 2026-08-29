process.env.NODE_ENV = 'test'; // SSRF 域名解析校验在测试环境跳过（字面 IP 检查仍生效）

/** 火山语音技术 声音复刻/TTS 适配器单元测试（mock fetch，不依赖真实网络）
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-voice-adapter.spec.ts
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  VoiceCloneAdapter,
  VoiceCloneError,
  defaultCustomSpeakerId,
  DEFAULT_VOICE_TTS_ENDPOINT,
  DEFAULT_VOICE_CLONE_ENDPOINT,
  type VolcanoVoiceConfig,
} from '../../src/modules/oral-workshop/adapters/voice.adapter';

const cfg: VolcanoVoiceConfig = {
  endpoint: 'https://openspeech.example.com/api/v3/tts/unidirectional',
  cloneEndpoint: 'https://openspeech.example.com/api/v3/tts/voice_clone',
  apiKey: 'voice-key-1',
  resourceId: 'seed-icl-2.0',
  format: 'mp3',
  sampleRate: 24000,
  timeoutMs: 5000,
};

function jsonResp(obj: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(obj),
    json: async () => obj,
    arrayBuffer: async () => Buffer.from(JSON.stringify(obj)),
  } as any;
}

/** HTTP Chunked 流式响应：每行一个 JSON（data 为 base64 音频分片） */
function chunkedResp(lines: unknown[], status = 200) {
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as any;
}

function binaryResp(bytes: string) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from(bytes),
  } as any;
}

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe('VoiceCloneAdapter', () => {
  it('cloneSpeaker：JSON 提交 base64 参考音频并返回 speaker_id + status', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    (globalThis as any).fetch = async (url: string, opts: any) => {
      calls.push({ url, opts });
      if (url.startsWith('https://cdn/')) return binaryResp('REF-AUDIO');
      return jsonResp({ code: 0, speaker_id: 'st_voice_7_abc', status: 2 });
    };
    const svc = new VoiceCloneAdapter(cfg);
    const out = await svc.cloneSpeaker({ refAudioUrl: 'https://cdn/ref.mp3', refAudioText: '参考音频文本', text: '测试文案', userId: 7 });
    assert.equal(out.speakerId, 'st_voice_7_abc');
    assert.equal(out.status, 2);
    assert.equal(calls.length, 2); // 下载参考音频 + 复刻
    const cloneCall = calls[1];
    assert.equal(cloneCall.url, cfg.cloneEndpoint);
    assert.equal(cloneCall.opts.method, 'POST');
    assert.equal(cloneCall.opts.headers['X-Api-Key'], 'voice-key-1');
    assert.ok(cloneCall.opts.headers['X-Api-Request-Id']);
    const body = JSON.parse(cloneCall.opts.body);
    assert.equal(body.speaker_id, 'custom_speaker_id');
    assert.ok(body.custom_speaker_id.startsWith('st_voice_7_'));
    assert.equal(body.audio.format, 'mp3');
    assert.equal(Buffer.from(body.audio.data, 'base64').toString(), 'REF-AUDIO');
  });

  it('cloneSpeaker：已有 speakerId 时跳过复刻请求', async () => {
    let fetchCalls = 0;
    (globalThis as any).fetch = async () => { fetchCalls += 1; return jsonResp({}); };
    const svc = new VoiceCloneAdapter(cfg);
    const out = await svc.cloneSpeaker({ refAudioUrl: 'x.mp3', text: 't', speakerId: 'spk_existing' });
    assert.equal(out.speakerId, 'spk_existing');
    assert.equal(fetchCalls, 0);
  });

  it('cloneSpeaker：上游非 2xx 抛 VoiceCloneError', async () => {
    (globalThis as any).fetch = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' } as any);
    const svc = new VoiceCloneAdapter(cfg);
    await assert.rejects(() => svc.cloneSpeaker({ refAudioUrl: 'https://cdn/ref.mp3', text: 't' }), VoiceCloneError);
  });

  it('cloneSpeaker：code 非 0 抛 VoiceCloneError（含平台错误信息）', async () => {
    (globalThis as any).fetch = async (url: string) => (url.startsWith('https://cdn/') ? binaryResp('X') : jsonResp({ code: 45001109, message: 'WERError' }));
    const svc = new VoiceCloneAdapter(cfg);
    await assert.rejects(() => svc.cloneSpeaker({ refAudioUrl: 'https://cdn/ref.mp3', text: 't' }), /WERError/);
  });

  it('synthesize：Chunked JSON 行 data base64 拼接为音频 buffer（请求头含 X-Api-Key/X-Api-Resource-Id）', async () => {
    let captured: any = null;
    (globalThis as any).fetch = async (url: string, opts: any) => {
      if (url === cfg.cloneEndpoint) return jsonResp({ code: 0, speaker_id: 'st_voice_1_x', status: 2 });
      if (url === cfg.endpoint) {
        captured = { url, opts };
        const part1 = Buffer.from('audio-part-1').toString('base64');
        const part2 = Buffer.from('audio-part-2').toString('base64');
        return chunkedResp([
          { code: 0, data: part1, sentence: { text: '你好' } },
          { code: 0, data: part2 },
        ]);
      }
      return binaryResp('REF');
    };
    const svc = new VoiceCloneAdapter(cfg);
    const out = await svc.synthesize({ refAudioUrl: 'https://cdn/ref.mp3', refAudioText: '参考', text: '你好世界', speedRatio: 0.9 });
    assert.equal(out.audio.toString('utf8'), 'audio-part-1audio-part-2');
    assert.equal(out.mimeType, 'audio/mpeg');
    assert.deepEqual(out.subtitle, ['你好']);
    assert.equal(captured.url, cfg.endpoint);
    assert.equal(captured.opts.headers['X-Api-Key'], 'voice-key-1');
    assert.equal(captured.opts.headers['X-Api-Resource-Id'], 'seed-icl-2.0');
    const req = JSON.parse(captured.opts.body);
    assert.equal(req.req_params.text, '你好世界');
    assert.equal(req.req_params.speaker, 'st_voice_1_x');
    assert.equal(req.req_params.audio_params.format, 'mp3');
    assert.equal(req.req_params.audio_params.sample_rate, 24000);
  });

  it('synthesize：chunk 内 code 非 0 抛 VoiceCloneError', async () => {
    (globalThis as any).fetch = async (url: string) => {
      if (url === cfg.cloneEndpoint) return jsonResp({ code: 0, speaker_id: 's1', status: 2 });
      return chunkedResp([{ code: 1, message: '合成失败' }]);
    };
    const svc = new VoiceCloneAdapter(cfg);
    await assert.rejects(() => svc.synthesize({ refAudioUrl: 'https://cdn/ref.mp3', text: 't', speakerId: 's1' }), /合成失败/);
  });

  it('synthesize：无音频数据抛 VoiceCloneError', async () => {
    (globalThis as any).fetch = async (url: string) => {
      if (url === cfg.cloneEndpoint) return jsonResp({ code: 0, speaker_id: 's1', status: 2 });
      return chunkedResp([{ code: 0, sentence: { text: '只有字幕' } }]);
    };
    const svc = new VoiceCloneAdapter(cfg);
    await assert.rejects(() => svc.synthesize({ refAudioUrl: 'https://cdn/ref.mp3', text: 't', speakerId: 's1' }), /未返回音频数据/);
  });

  it('generateVoice：复刻 + 合成返回 speakerId 与音频', async () => {
    (globalThis as any).fetch = async (url: string) => {
      if (url.startsWith('https://cdn/')) return binaryResp('REF');
      if (url === cfg.cloneEndpoint) return jsonResp({ code: 0, speaker_id: 'st_voice_9_y', status: 4 });
      if (url === cfg.endpoint) return chunkedResp([{ code: 0, data: Buffer.from('VOICE-BYTES').toString('base64') }]);
      return jsonResp({});
    };
    const svc = new VoiceCloneAdapter(cfg);
    const out = await svc.generateVoice({ refAudioUrl: 'https://cdn/ref.mp3', refAudioText: '参考', text: '你好' });
    assert.equal(out.speakerId, 'st_voice_9_y');
    assert.equal(out.audioBuffer.toString('utf8'), 'VOICE-BYTES');
  });

  it('defaultCustomSpeakerId：命名符合规范（字母开头、8-256 字符、仅数字字母-_）', () => {
    for (let i = 0; i < 5; i++) {
      const id = defaultCustomSpeakerId(7);
      assert.match(id, /^[a-z][a-z0-9_-]{7,}$/);
      assert.ok(id.length >= 8 && id.length <= 256);
      assert.ok(id.startsWith('st_voice_7_'));
    }
  });

  it('默认端点常量正确', () => {
    assert.equal(DEFAULT_VOICE_TTS_ENDPOINT, 'https://openspeech.bytedance.com/api/v3/tts/unidirectional');
    assert.equal(DEFAULT_VOICE_CLONE_ENDPOINT, 'https://openspeech.bytedance.com/api/v3/tts/voice_clone');
  });
});

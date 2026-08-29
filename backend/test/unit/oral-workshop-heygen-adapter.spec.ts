/** HeyGen 数字人适配器单元测试（mock fetch，不依赖真实网络）
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-heygen-adapter.spec.ts
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  HeyGenAdapter,
  HeyGenError,
  type HeyGenConfig,
  type HeyGenJobOptions,
} from '../../src/modules/oral-workshop/adapters/heygen.adapter';

const cfg: HeyGenConfig = {
  endpoint: 'https://api.heygen.example.com',
  apiKey: 'test-key',
  quality: '1080',
  pollIntervalMs: 1,
  maxAttempts: 5,
  timeoutMs: 3000,
};

const opts: HeyGenJobOptions = {
  audioUrl: 'https://cdn/voice.mp3',
  imageUrl: 'https://cdn/photo.jpg',
};

function jsonResp(obj: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(obj), json: async () => obj } as any;
}

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe('HeyGenAdapter', () => {
  it('submitJob：talking photo（图片+音频）提交 v2/video/generate → video_id', async () => {
    let captured: any = null;
    (globalThis as any).fetch = async (url: string, req: any) => {
      captured = { url, headers: req.headers, body: JSON.parse(req.body) };
      return jsonResp({ code: 10000, data: { video_id: 'video_9' } });
    };
    const svc = new HeyGenAdapter(cfg);
    const videoId = await svc.submitJob(opts);
    assert.equal(videoId, 'video_9');
    assert.ok(captured.url.endsWith('/v2/video/generate'));
    assert.equal(captured.headers['X-Api-Key'], 'test-key');
    assert.equal(captured.body.video_inputs[0].character.type, 'avatar');
    assert.equal(captured.body.video_inputs[0].character.avatar_id, 'INVALID_AVATAR_ID');
    assert.equal(captured.body.video_inputs[0].character.avatar_image_url, 'https://cdn/photo.jpg');
    assert.equal(captured.body.video_inputs[0].voice.audio_url, 'https://cdn/voice.mp3');
    assert.deepEqual(captured.body.dimension, { width: 1080, height: 1920 });
  });

  it('submitJob：预置形象（avatarId）不使用图片字段', async () => {
    let captured: any = null;
    (globalThis as any).fetch = async (_url: string, req: any) => {
      captured = JSON.parse(req.body);
      return jsonResp({ code: 10000, data: { video_id: 'video_10' } });
    };
    const svc = new HeyGenAdapter(cfg);
    await svc.submitJob({ audioUrl: 'https://cdn/v.mp3', avatarId: 'premade_01' });
    assert.equal(captured.video_inputs[0].character.avatar_id, 'premade_01');
    assert.equal(captured.video_inputs[0].character.avatar_image_url, undefined);
  });

  it('submitJob：缺形象抛 HeyGenError', async () => {
    const svc = new HeyGenAdapter(cfg);
    await assert.rejects(() => svc.submitJob({ audioUrl: 'https://cdn/v.mp3' }), HeyGenError);
  });

  it('submitJob：业务错误码抛 HeyGenError', async () => {
    (globalThis as any).fetch = async () => jsonResp({ code: 40907, message: '配额不足' });
    const svc = new HeyGenAdapter(cfg);
    await assert.rejects(() => svc.submitJob(opts), /配额不足/);
  });

  it('queryJob：processing → completed 轮询返回 video_url', async () => {
    const responses = [
      jsonResp({ code: 10000, data: { status: 'processing' } }),
      jsonResp({ code: 10000, data: { status: 'completed', video_url: 'https://cdn/human.mp4' } }),
    ];
    let calls = 0;
    (globalThis as any).fetch = async () => responses[Math.min(calls++, responses.length - 1)];
    const svc = new HeyGenAdapter(cfg);
    const res = await svc.queryJob('video_1', async () => {});
    assert.equal(res.status, 'completed');
    assert.equal(res.videoUrl, 'https://cdn/human.mp4');
    assert.equal(calls, 2);
  });

  it('queryJob：failed 状态抛 HeyGenError（含 error 文案）', async () => {
    (globalThis as any).fetch = async () => jsonResp({ code: 10000, data: { status: 'failed', error: '音频超长' } });
    const svc = new HeyGenAdapter(cfg);
    await assert.rejects(() => svc.queryJob('video_2', async () => {}), /音频超长/);
  });

  it('queryJob：超过最大轮询次数抛超时错误', async () => {
    (globalThis as any).fetch = async () => jsonResp({ code: 10000, data: { status: 'processing' } });
    const svc = new HeyGenAdapter(cfg);
    await assert.rejects(() => svc.queryJob('video_3', async () => {}), /超时/);
  });

  it('queryJob：成功但缺 video_url 抛错', async () => {
    (globalThis as any).fetch = async () => jsonResp({ code: 10000, data: { status: 'completed' } });
    const svc = new HeyGenAdapter(cfg);
    await assert.rejects(() => svc.queryJob('video_4', async () => {}), /缺少 video_url/);
  });

  it('generate：提交 + 轮询返回产物', async () => {
    const responses = [
      jsonResp({ code: 10000, data: { video_id: 'video_g' } }),
      jsonResp({ code: 10000, data: { status: 'completed', video_url: 'https://cdn/human_g.mp4' } }),
    ];
    let calls = 0;
    (globalThis as any).fetch = async () => responses[Math.min(calls++, responses.length - 1)];
    const svc = new HeyGenAdapter(cfg);
    const res = await svc.generate(opts);
    assert.equal(res.videoId, 'video_g');
    assert.equal(res.videoUrl, 'https://cdn/human_g.mp4');
  });

  it('listAvatars：返回官方形象列表', async () => {
    (globalThis as any).fetch = async (url: string) => {
      assert.ok(url.endsWith('/v1/avatars'));
      return jsonResp({
        code: 10000,
        data: { avatars: [{ avatar_id: 'a1', avatar_name: '王小明', avatar_url: 'https://cdn/a1.jpg' }] },
      });
    };
    const svc = new HeyGenAdapter(cfg);
    const list = await svc.listAvatars();
    assert.equal(list.length, 1);
    assert.equal(list[0].avatar_id, 'a1');
  });

  it('未配置 API Key 抛 HeyGenError', async () => {
    delete process.env.HEYGEN_API_KEY;
    const svc = new HeyGenAdapter();
    await assert.rejects(() => svc.submitJob(opts), /未配置 HeyGen API Key/);
  });
});

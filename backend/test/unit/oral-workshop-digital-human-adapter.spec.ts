/** 火山数字人适配器单元测试（mock fetch，不依赖真实网络）
 * 运行: node -r ts-node/register --test test/unit/oral-workshop-digital-human-adapter.spec.ts
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DigitalHumanAdapter,
  DigitalHumanError,
  type VolcanoDigitalHumanConfig,
  type DigitalHumanJobOptions,
} from '../../src/modules/oral-workshop/adapters/digital-human.adapter';

const cfg: VolcanoDigitalHumanConfig = {
  endpoint: 'https://dh.example.com',
  apiKey: 'test-key',
  submitPath: '/digital-human/submit',
  queryPath: '/digital-human/query',
  modelVersion: 'V1',
  pollIntervalMs: 1,
  maxAttempts: 5,
  timeoutMs: 3000,
  successStatuses: ['success', 'done'],
  failedStatuses: ['failed', 'error'],
};

const opts: DigitalHumanJobOptions = {
  audioUrl: 'https://cdn/voice.mp3',
  digitalHumanId: 'dh_001',
  canvas: { width: 1080, height: 1920 },
};

function jsonResp(obj: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(obj), json: async () => obj } as any;
}

afterEach(() => {
  delete (globalThis as any).fetch;
});

describe('DigitalHumanAdapter', () => {
  it('submitJob：提交音频+形象+画布 → task_id', async () => {
    let captured: any = null;
    (globalThis as any).fetch = async (url: string, req: any) => {
      captured = { url, body: JSON.parse(req.body) };
      return jsonResp({ data: { task_id: 'task_9' } });
    };
    const svc = new DigitalHumanAdapter(cfg);
    const taskId = await svc.submitJob(opts);
    assert.equal(taskId, 'task_9');
    assert.ok(captured.url.endsWith('/digital-human/submit'));
    assert.equal(captured.body.model_version, 'V1');
    assert.equal(captured.body.digital_human_id, 'dh_001');
    assert.equal(captured.body.audio_url, 'https://cdn/voice.mp3');
    assert.deepEqual(captured.body.canvas, { width: 1080, height: 1920 });
  });

  it('queryJob：pending → success 轮询返回 video_url', async () => {
    const responses = [
      jsonResp({ data: { status: 'processing' } }),
      jsonResp({ data: { status: 'success', video_url: 'https://cdn/human.mp4' } }),
    ];
    let calls = 0;
    (globalThis as any).fetch = async () => responses[Math.min(calls++, responses.length - 1)];
    const svc = new DigitalHumanAdapter(cfg);
    const res = await svc.queryJob('task_1', async () => {});
    assert.equal(res.status, 'success');
    assert.equal(res.videoUrl, 'https://cdn/human.mp4');
    assert.equal(calls, 2);
  });

  it('queryJob：failed 状态抛 DigitalHumanError', async () => {
    (globalThis as any).fetch = async () => jsonResp({ data: { status: 'failed', error: '合成失败' } });
    const svc = new DigitalHumanAdapter(cfg);
    await assert.rejects(() => svc.queryJob('task_2', async () => {}), DigitalHumanError);
  });

  it('queryJob：超过最大轮询次数抛超时错误', async () => {
    (globalThis as any).fetch = async () => jsonResp({ data: { status: 'processing' } });
    const svc = new DigitalHumanAdapter(cfg);
    await assert.rejects(() => svc.queryJob('task_3', async () => {}), /超时/);
  });

  it('queryJob：成功但缺 video_url 抛错', async () => {
    (globalThis as any).fetch = async () => jsonResp({ data: { status: 'success' } });
    const svc = new DigitalHumanAdapter(cfg);
    await assert.rejects(() => svc.queryJob('task_4', async () => {}), /缺少 video_url/);
  });

  it('generate：提交 + 轮询返回产物', async () => {
    const responses = [
      jsonResp({ data: { task_id: 'task_g' } }),
      jsonResp({ data: { status: 'done', video_url: 'https://cdn/human_g.mp4' } }),
    ];
    let calls = 0;
    (globalThis as any).fetch = async () => responses[Math.min(calls++, responses.length - 1)];
    const svc = new DigitalHumanAdapter(cfg);
    const res = await svc.generate(opts);
    assert.equal(res.taskId, 'task_g');
    assert.equal(res.videoUrl, 'https://cdn/human_g.mp4');
    assert.equal(res.modelVersion, 'V1');
  });
});